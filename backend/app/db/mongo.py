from pymongo import MongoClient
from pymongo.database import Database
from pymongo.server_api import ServerApi

from app.config import MONGO_URI, MONGO_DB_NAME

_client: MongoClient | None = None
_db: Database | None = None


def get_client() -> MongoClient:
    global _client
    if _client is None:
        _client = MongoClient(MONGO_URI, server_api=ServerApi("1"))
    return _client


def get_db() -> Database:
    global _db
    if _db is None:
        _db = get_client()[MONGO_DB_NAME]
    return _db


# Collection accessors
def threads():
    return get_db()["threads"]


def messages():
    return get_db()["messages"]


def branch_points():
    return get_db()["branch_points"]


def concept_mastery():
    return get_db()["concept_mastery"]


def review_schedule():
    return get_db()["review_schedule"]


def test_results():
    return get_db()["test_results"]


def learning_sessions():
    return get_db()["learning_sessions"]
