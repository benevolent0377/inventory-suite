#!/usr/bin/env python3
"""Seed the demo database with sample users and internal mail messages."""

import os
import sys

# Ensure backend is importable.
sys.path.insert(0, os.path.join(os.path.dirname(__file__), ".."))

from app import models
from app.auth import hash_passkey
from app.db import Base, SessionLocal, set_demo_db, reset_demo_db, DEMO_DB_PATH
from sqlalchemy import create_engine


def _engine():
    path = os.path.abspath(DEMO_DB_PATH)
    uri = path.replace("?", "%3f").replace("#", "%23")
    return create_engine(f"sqlite:///file:{uri}?mode=rwc&uri=true")


def seed():
    if not os.path.exists(DEMO_DB_PATH):
        print(f"Demo database not found at {DEMO_DB_PATH}")
        return

    token = set_demo_db(True)
    try:
        engine = _engine()
        Base.metadata.create_all(bind=engine)
        db = SessionLocal()
        try:
            # Ensure admin exists with predictable demo passkey.
            admin = db.query(models.User).filter(models.User.username == "admin").first()
            if not admin:
                admin = models.User(
                    name="Administrator",
                    username="admin",
                    email="",
                    is_admin=True,
                    theme="dark",
                    passkey_hash=hash_passkey("admin"),
                )
                db.add(admin)
                db.commit()
                db.refresh(admin)

            demo_users = [
                {"name": "Bjorn Dreva", "username": "bjorn"},
                {"name": "Peter", "username": "peter"},
                {"name": "Chrysa", "username": "chrysa"},
                {"name": "Connor", "username": "connor"},
                {"name": "Dominica", "username": "dominica"},
            ]

            users_by_username = {}
            for info in demo_users:
                user = db.query(models.User).filter(models.User.username == info["username"]).first()
                if not user:
                    user = models.User(
                        name=info["name"],
                        username=info["username"],
                        email="",
                        is_admin=False,
                        theme="dark",
                        passkey_hash=hash_passkey("password"),
                    )
                    db.add(user)
                    db.commit()
                    db.refresh(user)
                users_by_username[info["username"]] = user

            users_by_username["admin"] = admin

            def get_or_create_direct_thread(a_id, b_id):
                a_threads = {
                    p.thread_id
                    for p in db.query(models.MessageThreadParticipant).filter(
                        models.MessageThreadParticipant.user_id == a_id
                    ).all()
                }
                b_threads = {
                    p.thread_id
                    for p in db.query(models.MessageThreadParticipant).filter(
                        models.MessageThreadParticipant.user_id == b_id
                    ).all()
                }
                for thread_id in a_threads & b_threads:
                    thread = db.get(models.MessageThread, thread_id)
                    if thread and not thread.is_group:
                        count = (
                            db.query(models.MessageThreadParticipant)
                            .filter(models.MessageThreadParticipant.thread_id == thread.id)
                            .count()
                        )
                        if count == 2:
                            return thread
                thread = models.MessageThread(is_group=False, name="")
                db.add(thread)
                db.commit()
                db.refresh(thread)
                db.add_all(
                    [
                        models.MessageThreadParticipant(thread_id=thread.id, user_id=a_id),
                        models.MessageThreadParticipant(thread_id=thread.id, user_id=b_id),
                    ]
                )
                db.commit()
                return thread

            def add_message(thread_id, sender_id, body):
                msg = models.Message(thread_id=thread_id, sender_id=sender_id, body=body)
                db.add(msg)
                db.commit()
                db.refresh(msg)
                return msg

            def mark_read(message_id, user_id):
                existing = (
                    db.query(models.MessageReadReceipt)
                    .filter(
                        models.MessageReadReceipt.message_id == message_id,
                        models.MessageReadReceipt.user_id == user_id,
                    )
                    .first()
                )
                if not existing:
                    db.add(models.MessageReadReceipt(message_id=message_id, user_id=user_id))
                    db.commit()

            # Conversation: Bjorn and Peter
            bjorn = users_by_username["bjorn"]
            peter = users_by_username["peter"]
            thread_bp = get_or_create_direct_thread(bjorn.id, peter.id)

            m1 = add_message(thread_bp.id, peter.id, "Let's do lunch. I'm hungry.")
            m2 = add_message(thread_bp.id, bjorn.id, "I can't. Have to finish this Q3 keynote.")
            m3 = add_message(thread_bp.id, peter.id, "Need help?")
            m4 = add_message(
                thread_bp.id,
                bjorn.id,
                "Not really. Maybe just feedback on content. Can you check this?",
            )
            m5 = add_message(
                thread_bp.id,
                peter.id,
                "Interesting. Let's have a quick call now. Hello? Are you still here? Ok, I'm going for lunch, I've waited long enough.",
            )

            mark_read(m1.id, bjorn.id)
            mark_read(m2.id, peter.id)
            mark_read(m3.id, bjorn.id)
            mark_read(m4.id, peter.id)
            mark_read(m5.id, bjorn.id)

            # Conversation: Bjorn and Chrysa (some unread)
            chrysa = users_by_username["chrysa"]
            thread_bc = get_or_create_direct_thread(bjorn.id, chrysa.id)
            add_message(thread_bc.id, chrysa.id, "Did you see the updated inventory report?")
            add_message(thread_bc.id, bjorn.id, "Yes, the numbers look good this month.")

            # Conversation: Dominica and Connor
            connor = users_by_username["connor"]
            dominica = users_by_username["dominica"]
            thread_dc = get_or_create_direct_thread(dominica.id, connor.id)
            add_message(thread_dc.id, connor.id, "Can you review the new order request?")
            add_message(thread_dc.id, dominica.id, "Sure, I'll check it this afternoon.")

            # Group conversation
            group_thread = models.MessageThread(is_group=True, name="Team Updates")
            db.add(group_thread)
            db.commit()
            db.refresh(group_thread)
            for uname in ["bjorn", "peter", "chrysa", "connor"]:
                db.add(
                    models.MessageThreadParticipant(
                        thread_id=group_thread.id, user_id=users_by_username[uname].id
                    )
                )
            db.commit()
            add_message(group_thread.id, peter.id, "Reminder: team sync at 2 PM.")
            add_message(group_thread.id, chrysa.id, "I'll be there.")

            print("Seeded demo users and messages.")
        finally:
            db.close()
    finally:
        reset_demo_db(token)


if __name__ == "__main__":
    seed()
