from app.services.storage import object_key


def test_object_keys_are_owner_scoped_and_sanitized() -> None:
    key = object_key("user_123", "../../my answer (final).png")
    assert key.startswith("users/user_123/")
    assert key.endswith("/my-answer-final-.png")
    assert ".." not in key
