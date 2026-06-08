"""Deterministic rule engine for AI-assisted auto-decisions on borrow requests.

The DECISION is always made here, in plain code — the LLM only *explains* the
outcome (see apps.messaging.assistant.explain_decision). This module is pure:
`evaluate()` does no DB I/O (callers pass in the precomputed counts), which keeps
it trivially testable. Config lives in the cache and is OFF by default, so a
cache miss / restart fails closed (no automation).
"""
from collections import namedtuple

from django.core.cache import cache
from django.utils import timezone

CONFIG_CACHE_KEY = 'plmun_auto_decision'

# Decision actions
AUTO_APPROVE = 'AUTO_APPROVE'
AUTO_REJECT = 'AUTO_REJECT'
NEEDS_REVIEW = 'NEEDS_REVIEW'

# Recommendation values stored on the request (Request.AutoRecommendation)
REC_APPROVE = 'APPROVE'
REC_REJECT = 'REJECT'
REC_REVIEW = 'REVIEW'

RECOMMENDATION = {
    AUTO_APPROVE: REC_APPROVE,
    AUTO_REJECT: REC_REJECT,
    NEEDS_REVIEW: REC_REVIEW,
}

MODES = ('off', 'suggest', 'auto')

DEFAULTS = {
    'mode': 'off',
    'max_auto_qty': 5,
    'daily_cap': 50,
    'max_active_borrows': 5,
    'reject_over_qty': 20,
}

# Returnable items only auto-approve at these priorities; HIGH → human review.
ELIGIBLE_RETURNABLE_PRIORITIES = {'LOW', 'MEDIUM'}

_INT_KEYS = ('max_auto_qty', 'daily_cap', 'max_active_borrows', 'reject_over_qty')
_DAILY_KEY_PREFIX = 'plmun_auto_approved'

Decision = namedtuple('Decision', ['action', 'reasons'])


def get_config():
    """Current config = DEFAULTS overlaid with admin-set cache values."""
    stored = cache.get(CONFIG_CACHE_KEY)
    config = dict(DEFAULTS)
    if isinstance(stored, dict):
        config.update({k: stored[k] for k in DEFAULTS if k in stored})
    if config.get('mode') not in MODES:
        config['mode'] = 'off'
    for key in _INT_KEYS:
        try:
            config[key] = max(0, int(config[key]))
        except (TypeError, ValueError):
            config[key] = DEFAULTS[key]
    return config


def set_config(updates):
    """Merge admin updates over the current config and persist (no expiry)."""
    config = get_config()
    if 'mode' in updates and updates['mode'] in MODES:
        config['mode'] = updates['mode']
    for key in _INT_KEYS:
        if key in updates and updates[key] is not None:
            try:
                config[key] = max(0, int(updates[key]))
            except (TypeError, ValueError):
                pass
    cache.set(CONFIG_CACHE_KEY, config, timeout=None)
    return config


def _daily_key():
    return f'{_DAILY_KEY_PREFIX}:{timezone.localdate().isoformat()}'


def get_daily_count():
    return cache.get(_daily_key()) or 0


def increment_daily_count():
    """Best-effort daily auto-approve counter (self-expires after 2 days)."""
    key = _daily_key()
    try:
        return cache.incr(key)
    except ValueError:
        cache.set(key, 1, timeout=60 * 60 * 48)
        return 1


def evaluate(*, is_returnable, priority, quantity, active_borrows, daily_count, config,
             credit_score=100, overdue_count=0, stock=None):
    """Pure deterministic decision.

    Assumes the request already passed RequestCreateSerializer.validate (item
    AVAILABLE, quantity <= stock, access OK) and the requester is not flagged.
    Returns a Decision(action, reasons).
    """
    max_active = config['max_active_borrows']
    reject_over = config['reject_over_qty']
    max_qty = config['max_auto_qty']
    daily_cap = config['daily_cap']
    credit_score = 100 if credit_score is None else max(0, min(100, int(credit_score)))
    overdue_count = max(0, int(overdue_count or 0))

    # 1. Clear policy breaches → auto-reject.
    if stock is not None and quantity > int(stock):
        return Decision(AUTO_REJECT, [
            f'Requested quantity {quantity} exceeds current stock of {stock}.'
        ])
    if credit_score <= 75:
        return Decision(AUTO_REJECT, [
            f'Borrower credit score is {credit_score}; account should be reviewed before more requests.'
        ])
    if active_borrows >= max_active:
        return Decision(AUTO_REJECT, [
            f'Borrower already has {active_borrows} item(s) out (limit {max_active}).'
        ])
    if quantity > reject_over:
        return Decision(AUTO_REJECT, [
            f'Requested quantity {quantity} exceeds the hard cap of {reject_over}.'
        ])

    if credit_score < 100:
        return Decision(NEEDS_REVIEW, [
            f'Borrower credit score is {credit_score} with {overdue_count} overdue incident(s); staff review required.'
        ])

    # 2. Eligible for auto-approve? Consumables always; returnables only LOW/MEDIUM.
    eligible = (not is_returnable) or (priority in ELIGIBLE_RETURNABLE_PRIORITIES)
    if eligible and quantity <= max_qty and daily_count < daily_cap:
        kind = 'consumable' if not is_returnable else f'{str(priority).lower()}-priority returnable'
        return Decision(AUTO_APPROVE, [
            f'Auto-approved: {kind}, quantity {quantity} within the cap of {max_qty}.'
        ])

    # 3. Otherwise a human decides.
    if not eligible:
        return Decision(NEEDS_REVIEW, ['High-priority returnable item — needs staff review.'])
    if quantity > max_qty:
        return Decision(NEEDS_REVIEW, [f'Quantity {quantity} is above the auto-approve cap of {max_qty}.'])
    if daily_count >= daily_cap:
        return Decision(NEEDS_REVIEW, [f'Daily auto-approve cap of {daily_cap} reached.'])
    return Decision(NEEDS_REVIEW, ['Needs staff review.'])
