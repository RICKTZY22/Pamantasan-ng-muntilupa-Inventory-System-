from django.core.cache import cache


COUNT_KEY = 'messaging:presence:count:{user_id}'


def _key(user_id):
    return COUNT_KEY.format(user_id=user_id)


def mark_online(user_id):
    key = _key(user_id)
    count = int(cache.get(key, 0) or 0) + 1
    cache.set(key, count, timeout=None)
    return True


def mark_offline(user_id):
    key = _key(user_id)
    count = max(int(cache.get(key, 0) or 0) - 1, 0)
    if count:
        cache.set(key, count, timeout=None)
        return True
    cache.delete(key)
    return False


def is_user_online(user_id):
    return int(cache.get(_key(user_id), 0) or 0) > 0
