import copy
import json

from app.services.local_test_bank import local_test_bank_path, merge_local_test_bank
from app.services import pyq_catalog
from tests.test_pyq_catalog import sample_question


def test_local_file_is_never_read_in_hosted_mode(monkeypatch, tmp_path):
    monkeypatch.setenv("HETU_DATA_DIR", str(tmp_path))
    monkeypatch.setenv("ENVIRONMENT", "production")
    assert local_test_bank_path() is None
    monkeypatch.setenv("ENVIRONMENT", "local")
    assert local_test_bank_path() == tmp_path / "test-series-bank.json"


def test_private_book_is_separate_from_official_metadata():
    official = sample_question()
    imported = sample_question(id="local:1", bookSlug="local-test-series-example")
    manifest = {
        "bankVersion": "test", "books": [{"slug": "gate-cse", "count": 1}],
        "subjects": [{"slug": "algorithms", "count": 1, "topics": [{"slug": "sorting", "count": 1}]}],
        "benchmarkPapers": [{"questionUids": [official["id"]]}],
    }
    original = copy.deepcopy(manifest)
    questions = [official]
    merged = merge_local_test_bank(manifest, questions, {"books": [
        {"slug": "local-test-series-example", "label": "Example", "questions": [imported]}
    ]})
    assert manifest == original
    assert merged["books"][0]["count"] == 1
    assert merged["books"][1]["sourceClass"] == "user-import"
    assert merged["subjects"][0]["count"] == 2
    assert merged["benchmarkPapers"] == original["benchmarkPapers"]
    assert len(questions) == merged["questionCount"] == 2


def test_local_catalog_reloads_when_private_bank_changes(monkeypatch, tmp_path):
    monkeypatch.setenv("ENVIRONMENT", "local")
    monkeypatch.setenv("HETU_DATA_DIR", str(tmp_path))
    monkeypatch.setattr(pyq_catalog, "_CACHED", None)
    monkeypatch.setattr(pyq_catalog, "_LOCAL_STAMP", None)
    before = pyq_catalog.load_catalog()
    imported = sample_question(id="local:reload", bookSlug="local-test-series-reload")
    (tmp_path / "test-series-bank.json").write_text(json.dumps({"books": [
        {"slug": "local-test-series-reload", "label": "Reload", "questions": [imported]}
    ]}))
    after = pyq_catalog.load_catalog()
    assert after.version != before.version
    assert after.question_count == before.question_count + 1
    assert after.by_uid["local:reload"].book_slug == "local-test-series-reload"
    assert pyq_catalog.load_catalog() is after
