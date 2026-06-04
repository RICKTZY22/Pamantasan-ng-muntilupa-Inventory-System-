from django.core.cache import cache


COUNT_KEY = 'messaging:presence:count:{user_id}'
# A crashed/abruptly-closed socket may never run disconnect(), so the ref-count
# would pin a user "online" forever. Give it a TTL instead; active sockets keep
# refreshing it via touch() on every frame.
PRESENCE_TTL = 60 * 60 * 2  # 2 hours


def _key(user_id):
    return COUNT_KEY.format(user_id=user_id)


def mark_online(user_id):
    key = _key(user_id)
    count = int(cache.get(key, 0) or 0) + 1
    cache.set(key, count, timeout=PRESENCE_TTL)
    return True


def mark_offline(user_id):
    key = _key(user_id)
    count = max(int(cache.get(key, 0) or 0) - 1, 0)
    if count:
        cache.set(key, count, timeout=PRESENCE_TTL)
        return True
    cache.delete(key)
    return False


def touch(user_id):
    """Refresh the TTL while a socket is active so a long-lived connection
    doesn't expire to 'offline' between actions."""
    key = _key(user_id)
    count = int(cache.get(key, 0) or 0)
    if count:
        cache.set(key, count, timeout=PRESENCE_TTL)


def is_user_online(user_id):
    return int(cache.get(_key(user_id), 0) or 0) > 0
