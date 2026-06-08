"""Read-only assistant for the Messages area.

The assistant is intentionally a thin layer over the existing conversation
tables so users keep history without us adding a second chat system. The LLM
provider is backend-only and selected by ASSISTANT_PROVIDER.
"""

from django.conf import settings
from django.contrib.auth import get_user_model
from django.db.models import Count
from django.utils import timezone
from django.utils.html import strip_tags
from datetime import timedelta
from urllib.parse import urlparse
import re

import requests

from apps.inventory.models import Item
from apps.requests.models import Request
from . import services
from .models import Conversation, ConversationMember, Message
from .presence import is_user_online


ASSISTANT_USERNAME = 'plmun_assistant'
ASSISTANT_NAME = 'PLMun Assistant'
MAX_PROMPT_CHARS = 1200
MEMORY_MESSAGE_LIMIT = 10
AUTO_REPLY_COOLDOWN_MINUTES = 15
AUTO_REPLY_PREFIX = 'PLMun Assistant - auto-reply while staff are away:'

SYSTEM_INSTRUCTION = (
    'You are PLMun Assistant for the PLMun Nexus inventory system. '
    'Answer in formal English. Keep answers concise, helpful, and read-only. '
    'Use clean plain text formatting. Start with a direct answer, then use short hyphen bullets only when listing records. '
    'Never use asterisks as bullets. Put each listed status, item, or request on its own line. '
    'Keep most answers under six lines unless the user asks for details. '
    'Do not claim you created, approved, rejected, edited, deleted, or sent any request. '
    'Never reveal secrets, API keys, passwords, tokens, or environment values. '
    'If a task needs staff approval, tell the user that staff/admin must complete it.'
)

EXPLAIN_SYSTEM_INSTRUCTION = (
    'You explain an automated inventory borrow-request decision to staff in one or two '
    'short, factual sentences of formal English. The decision was already made by '
    'deterministic rules — state it plainly and give the reason. Do not invent new '
    'policy, do not add caveats, and never reveal secrets.'
)


class AssistantUnavailable(Exception):
    """Raised when the configured assistant provider cannot answer."""


def is_assistant_user(user):
    return bool(user and getattr(user, 'username', '') == ASSISTANT_USERNAME)


def get_assistant_user():
    User = get_user_model()
    user, created = User.objects.get_or_create(
        username=ASSISTANT_USERNAME,
        defaults={
            'first_name': 'PLMun',
            'last_name': 'Assistant',
            'email': 'assistant@plmun-nexus.local',
            'role': 'STAFF',
            'is_active': False,
        },
    )
    if created:
        user.set_unusable_password()
        user.save(update_fields=['password'])
    elif user.is_active or user.role != 'STAFF':
        user.is_active = False
        user.role = 'STAFF'
        user.save(update_fields=['is_active', 'role'])
    return user


def get_or_create_assistant_conversation(user):
    assistant = get_assistant_user()
    conv, _created = services.get_or_create_direct_conversation(user, assistant)
    return conv


def _role_scoped_items(user):
    role_hierarchy = get_user_model().ROLE_HIERARCHY
    user_level = role_hierarchy.get(user.role, 0)
    accessible_levels = [role for role, level in role_hierarchy.items() if level <= user_level]
    qs = Item.objects.filter(access_level__in=accessible_levels)
    if user.role in ['STUDENT', 'FACULTY']:
        qs = qs.exclude(status='RETIRED')
    return qs


def _role_scoped_requests(user):
    qs = Request.objects.filter(is_cleared=False)
    if not user.has_min_role('STAFF'):
        qs = qs.filter(requested_by=user)
    return qs.select_related('requested_by', 'item')


def _conversation_memory(conversation):
    if not conversation:
        return 'No prior conversation memory.'
    rows = list(
        conversation.messages
        .select_related('sender')
        .order_by('-created_at')[:MEMORY_MESSAGE_LIMIT]
    )
    rows.reverse()
    if not rows:
        return 'No prior conversation memory.'
    lines = []
    for msg in rows:
        body = strip_tags((msg.body or '').strip())
        if not body:
            continue
        sender = msg.sender
        if is_assistant_user(sender):
            label = 'Assistant'
        elif getattr(sender, 'is_staff_or_above', False):
            label = f'Staff/Admin ({sender.get_full_name() or sender.username})'
        else:
            label = f'User ({sender.get_full_name() or sender.username})'
        lines.append(f'{label}: {body[:500]}')
    return '\n'.join(lines) if lines else 'No prior conversation memory.'


def _support_directory_text():
    """Active staff/admin users the requester can contact, with their role,
    department (their 'location'), and phone. The assistant user is excluded
    (is_active=False keeps it out)."""
    User = get_user_model()
    staff = (
        User.objects
        .filter(role__in=['STAFF', 'ADMIN'], is_active=True)
        .order_by('role', 'first_name', 'username')
    )
    rows = []
    for u in staff:
        name = u.get_full_name() or u.username
        dept = u.department or 'unspecified'
        phone = u.phone or 'not listed'
        rows.append(f'{name} ({u.role}, department={dept}, phone={phone})')
    return '; '.join(rows) or 'none on record.'


def _referred_item_text(item):
    """Full single-item detail block for when the user refers an item to ask
    about it specifically (e.g. its brand). Returns '' when no item is given."""
    if not item:
        return ''
    duration = f'{item.borrow_duration} {item.borrow_duration_unit.lower()}' if item.borrow_duration else 'not set'
    parts = [
        f'name={item.name}',
        f'brand={item.brand or "unknown"}',
        f'category={item.category}',
        f'quantity={item.quantity}',
        f'status={item.status}',
        f'location={item.location or "unspecified"}',
        f'access_level={item.access_level}',
        f'returnable={"yes" if item.is_returnable else "no"}',
        f'borrow_limit={duration}',
        f'description={strip_tags(item.description or "").strip() or "none"}',
    ]
    return '; '.join(parts)


def build_context(user, question, conversation=None, mode='assistant', referred_item=None):
    items = _role_scoped_items(user)
    requests = _role_scoped_requests(user)
    q = question[:MAX_PROMPT_CHARS]

    status_counts = dict(items.values_list('status').annotate(count=Count('id')).values_list('status', 'count'))
    request_counts = dict(requests.values_list('status').annotate(count=Count('id')).values_list('status', 'count'))

    matching_items = items.filter(name__icontains=q[:80]).order_by('name')[:8] if q else []
    low_stock = items.filter(quantity__lte=Item.get_low_stock_threshold(), quantity__gt=0).exclude(status='RETIRED').order_by('quantity', 'name')[:8]
    recent_requests = requests.order_by('-created_at')[:8]

    low_stock_text = '; '.join(f'{i.name} ({i.quantity}, {i.status})' for i in low_stock) or 'none.'
    matching_items_text = '; '.join(
        f'{i.name} ({i.category}, qty {i.quantity}, {i.status}, {i.location})'
        for i in matching_items
    ) or 'none.'
    recent_requests_text = '; '.join(f'{r.item_name} x{r.quantity} - {r.status}' for r in recent_requests) or 'none.'

    inventory_status_text = ', '.join(f'{status}: {count}' for status, count in status_counts.items()) or 'none'
    request_status_text = ', '.join(f'{status}: {count}' for status, count in request_counts.items()) or 'none'

    lines = [
        'You are PLMun Assistant inside the PLMun Nexus inventory system.',
        'Answer in formal English. Be concise, practical, and read-only.',
        'Formatting rule: use paragraphs and hyphen bullets only; never use asterisks as bullets.',
        'Never claim you changed data. Never reveal secrets, tokens, passwords, or environment values.',
        f'Current user: role={user.role}, name={user.get_full_name() or user.username}.',
        f'Visible inventory totals: total={items.count()}, by_status={inventory_status_text}.',
        f'Visible request totals: total={requests.count()}, by_status={request_status_text}.',
        f'Low-stock visible items: {low_stock_text}',
        f'Question-related visible items: {matching_items_text}',
        f'Recent visible requests: {recent_requests_text}',
        f'Support directory (staff/admin the user can contact, with role, department as location, and phone): {_support_directory_text()}',
        'When asked who the staff/admin are or where they are located, answer from the support directory above (department is their location).',
        'Item pickup and returns are handled in person by staff/admin; an item\'s borrow limit/due date is in its record. You cannot schedule pickups.',
        f'Mode: {mode}.',
        'Recent conversation memory:',
        _conversation_memory(conversation),
    ]

    # The referred item goes LAST — right before the question — so it's the most
    # salient context. Placed earlier, a small model lets recent conversation
    # memory (other items discussed before) hijack the word "this" and answers
    # about the wrong item. The instruction binds "this" to this item explicitly.
    referred_text = _referred_item_text(referred_item)
    if referred_text:
        lines += [
            'IMPORTANT: The user has referred ONE specific inventory item and is asking about THIS item.',
            'It EXISTS in the inventory. Answer using only the authoritative fields below.',
            'Ignore any other item mentioned earlier in this conversation or in the lists above — '
            'when the user says "this", "this item", or "it", they mean exactly this referred item.',
            'Never say it is not listed or not found. If a field reads "unknown" or "none", say that detail is not recorded.',
            f'Referred item: {referred_text}',
        ]

    lines += [
        'User question:',
        q,
    ]
    return '\n'.join(lines)


def polish_reply_text(text):
    """Normalize Gemini's occasional markdown-ish output into chat-friendly text."""
    cleaned = strip_tags((text or '').strip())
    cleaned = re.sub(r'\r\n?', '\n', cleaned)
    cleaned = re.sub(r'^\s*(?:\*|\u2022)\s+', '- ', cleaned, flags=re.MULTILINE)
    cleaned = re.sub(r'\s+(?:\*|\u2022)\s+', '\n- ', cleaned)
    cleaned = re.sub(
        r'\s+(Your recent requests include:|Recent visible requests:|Visible request totals:)',
        r'\n\n\1',
        cleaned,
        flags=re.IGNORECASE,
    )
    cleaned = re.sub(r'\n{3,}', '\n\n', cleaned)
    return cleaned.strip()


def _generate_gemini(prompt, system_instruction=SYSTEM_INSTRUCTION):
    """Cloud provider (production). Returns raw reply text."""
    api_key = getattr(settings, 'GEMINI_API_KEY', '')
    if not api_key:
        raise AssistantUnavailable('Gemini is not configured yet. Add GEMINI_API_KEY in the backend environment.')

    try:
        from google import genai
        from google.genai import types
    except ImportError as exc:
        raise AssistantUnavailable('Gemini SDK is not installed on the backend.') from exc

    try:
        client = genai.Client(api_key=api_key)
        response = client.models.generate_content(
            model=getattr(settings, 'GEMINI_MODEL', 'gemini-2.5-flash'),
            contents=prompt,
            config=types.GenerateContentConfig(system_instruction=system_instruction),
        )
    except Exception as exc:
        raise AssistantUnavailable('Gemini could not answer right now. Please try again later.') from exc

    return getattr(response, 'text', '') or ''


def _validate_ollama_base_url(base):
    parsed = urlparse(base)
    if parsed.scheme not in {'http', 'https'} or not parsed.hostname:
        raise AssistantUnavailable('OLLAMA_BASE_URL must be a valid http(s) URL.')

    host = parsed.hostname.lower()
    allowed_hosts = set(getattr(settings, 'OLLAMA_ALLOWED_HOSTS', ['localhost', '127.0.0.1', '::1']))
    if '*' not in allowed_hosts and host not in allowed_hosts:
        raise AssistantUnavailable(
            f'Ollama host "{host}" is not allowed. Add it to OLLAMA_ALLOWED_HOSTS if this is intentional.'
        )
    return base.rstrip('/')


def _generate_ollama(prompt, system_instruction=SYSTEM_INSTRUCTION, timeout=None):
    """Local provider (development). Talks to a running Ollama server over HTTP
    using the chat API — no API key needed. Returns raw reply text."""
    base = _validate_ollama_base_url(getattr(settings, 'OLLAMA_BASE_URL', 'http://localhost:11434'))
    model = getattr(settings, 'OLLAMA_MODEL', 'qwen2.5:7b-instruct')
    num_ctx = getattr(settings, 'OLLAMA_NUM_CTX', 4096)
    # Bounded so a slow/hung local model can't tie up a request worker for minutes.
    if timeout is None:
        timeout = getattr(settings, 'OLLAMA_TIMEOUT', 30)

    try:
        response = requests.post(
            f'{base}/api/chat',
            json={
                'model': model,
                'messages': [
                    {'role': 'system', 'content': system_instruction},
                    {'role': 'user', 'content': prompt},
                ],
                'stream': False,
                'options': {'temperature': 0.3, 'num_ctx': num_ctx},
            },
            timeout=timeout,
        )
    except requests.exceptions.ConnectionError as exc:
        raise AssistantUnavailable(
            f'Ollama is not reachable at {base}. Start it with "ollama serve" and pull the model with "ollama pull {model}".'
        ) from exc
    except requests.exceptions.RequestException as exc:
        raise AssistantUnavailable('Ollama could not answer right now. Please try again later.') from exc

    if response.status_code == 404:
        raise AssistantUnavailable(f'Ollama model "{model}" is not installed. Run "ollama pull {model}".')
    if response.status_code != 200:
        raise AssistantUnavailable('Ollama could not answer right now. Please try again later.')

    try:
        data = response.json()
    except ValueError as exc:
        raise AssistantUnavailable('Ollama returned an unexpected response.') from exc

    return (data.get('message') or {}).get('content', '') or ''


def _dispatch_prompt(prompt, system_instruction=SYSTEM_INSTRUCTION, timeout=None):
    """Send a fully-built prompt to the configured provider; returns raw text.
    Provider chosen by settings.ASSISTANT_PROVIDER ('gemini' | 'ollama')."""
    provider = getattr(settings, 'ASSISTANT_PROVIDER', 'gemini')
    if provider == 'ollama':
        return _generate_ollama(prompt, system_instruction=system_instruction, timeout=timeout)
    if provider == 'gemini':
        return _generate_gemini(prompt, system_instruction=system_instruction)
    raise AssistantUnavailable(
        f'Unknown assistant provider "{provider}". Use "ollama" for local development or "gemini" for production.'
    )


def generate_reply(user, question, conversation=None, mode='assistant', referred_item=None):
    """Build the role-scoped context and dispatch to the configured provider."""
    prompt = build_context(user, question, conversation=conversation, mode=mode, referred_item=referred_item)
    text = polish_reply_text(_dispatch_prompt(prompt))
    if not text:
        raise AssistantUnavailable('The assistant returned an empty response. Please try again.')
    return text


def templated_decision_note(facts):
    """Deterministic, provider-free explanation built only from structured facts.
    Instant + reliable — used for the auto-decision note (and as the LLM fallback).
    Keeps the LLM out of the request-create hot path."""
    verb = {
        'approve': 'Auto-approved', 'reject': 'Auto-rejected', 'review': 'Sent for staff review',
    }.get(str(facts.get('decision', 'review')).lower(), 'Reviewed')
    item = strip_tags(str(facts.get('item_name', 'item')))[:80]
    base = f'{verb}: {item} (qty {facts.get("quantity", "?")}).'
    reasons = facts.get('reasons') or []
    if reasons:
        base += ' ' + ' '.join(str(r) for r in reasons)
    return base.strip()


def explain_decision(facts):
    """Short, human-readable explanation of a RULE decision for staff.

    Fed ONLY sanitized structured facts (never the requester's free-text purpose),
    so the model cannot be steered by user input. The DECISION is made by the rule
    engine; this is presentation only. Falls back to a deterministic templated
    string if the provider is unavailable or slow — the decision never depends on
    the AI."""
    template = templated_decision_note(facts)
    prompt = '\n'.join([
        'Explain this borrow-request decision to staff in one or two short sentences.',
        f'Decision: {str(facts.get("decision", "review")).lower()}',
        f'Item: {strip_tags(str(facts.get("item_name", "")))[:80]}',
        f'Category: {facts.get("category", "")}',
        f'Returnable: {facts.get("is_returnable")}',
        f'Priority: {facts.get("priority", "")}',
        f'Quantity requested: {facts.get("quantity", "")}',
        f'In stock: {facts.get("stock", "")}',
        f'Borrower active borrows: {facts.get("active_borrows", "")}',
        f'Borrower credit score: {facts.get("credit_score", "")}',
        f'Borrower overdue incidents: {facts.get("overdue_count", "")}',
        f'Rule reasons: {" ".join(str(r) for r in (facts.get("reasons") or []))}',
    ])
    try:
        raw = _dispatch_prompt(prompt, system_instruction=EXPLAIN_SYSTEM_INSTRUCTION, timeout=10)
        return polish_reply_text(raw) or template
    except Exception:
        # AssistantUnavailable or anything else → the decision stands; use template.
        return template


def save_assistant_exchange(user, body, item=None):
    clean_body = strip_tags((body or '')).strip()
    if not clean_body:
        return None, None, 'Message cannot be empty.'
    if len(clean_body) > MAX_PROMPT_CHARS:
        return None, None, f'Message must be {MAX_PROMPT_CHARS} characters or fewer.'

    conv = get_or_create_assistant_conversation(user)
    assistant = get_assistant_user()
    user_msg = services.create_message(conv, user, body=clean_body, item=item)
    ConversationMember.objects.filter(conversation=conv, user=user).update(last_read_at=user_msg.created_at)

    reply = generate_reply(user, clean_body, conversation=conv, mode='assistant_thread', referred_item=item)
    assistant_msg = services.create_message(conv, assistant, body=reply)
    return user_msg, assistant_msg, None


def create_offline_auto_reply(conversation_id, trigger_user_id, incoming_body):
    User = get_user_model()
    conversation = (
        Conversation.objects
        .prefetch_related('members__user')
        .get(pk=conversation_id)
    )
    trigger_user = User.objects.get(pk=trigger_user_id)
    if trigger_user.is_staff_or_above or is_assistant_user(trigger_user):
        return None

    members = [member.user for member in conversation.members.all()]
    staff_members = [user for user in members if user.is_staff_or_above and not is_assistant_user(user)]
    if not staff_members or any(is_user_online(user.id) for user in staff_members):
        return None

    cooldown_since = timezone.now() - timedelta(minutes=AUTO_REPLY_COOLDOWN_MINUTES)
    recent_auto_reply = Message.objects.filter(
        conversation=conversation,
        sender=get_assistant_user(),
        body__startswith=AUTO_REPLY_PREFIX,
        created_at__gte=cooldown_since,
    ).exists()
    if recent_auto_reply:
        return None

    prompt = (
        'A student or faculty member sent this message while all staff/admin '
        'participants in the thread are offline. Write one short, helpful '
        'read-only auto-reply. Tell them staff/admin will follow up when available. '
        f'Incoming message: {incoming_body[:MAX_PROMPT_CHARS]}'
    )
    try:
        reply = generate_reply(trigger_user, prompt, conversation=conversation, mode='offline_auto_reply')
    except AssistantUnavailable:
        return None

    body = f'{AUTO_REPLY_PREFIX}\n\n{reply}'
    msg = services.create_message(conversation, get_assistant_user(), body=body)
    return services.serialize_message(msg), services.member_user_ids(conversation)
