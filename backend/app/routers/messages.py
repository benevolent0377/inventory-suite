from typing import Optional

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import func
from sqlalchemy.orm import Session

from .. import models, schemas
from ..auth import require_user
from ..db import get_db

router = APIRouter(prefix="/messages", tags=["messages"])


def _participant_ids(db: Session, thread_id: int) -> set[int]:
    return {
        p.user_id
        for p in db.query(models.MessageThreadParticipant).filter(
            models.MessageThreadParticipant.thread_id == thread_id
        ).all()
    }


def _thread_name(db: Session, thread: models.MessageThread, current_user_id: int) -> str:
    if thread.name:
        return thread.name
    participants = (
        db.query(models.User)
        .join(
            models.MessageThreadParticipant,
            models.MessageThreadParticipant.user_id == models.User.id,
        )
        .filter(
            models.MessageThreadParticipant.thread_id == thread.id,
            models.User.id != current_user_id,
        )
        .all()
    )
    if not participants:
        return "Me"
    return ", ".join(p.name or p.username for p in participants)


def _message_read_by(db: Session, message_id: int, user_id: int) -> bool:
    return (
        db.query(models.MessageReadReceipt)
        .filter(
            models.MessageReadReceipt.message_id == message_id,
            models.MessageReadReceipt.user_id == user_id,
        )
        .first()
        is not None
    )


def _message_deleted_by(db: Session, message_id: int, user_id: int) -> bool:
    return (
        db.query(models.MessageDeletion)
        .filter(
            models.MessageDeletion.message_id == message_id,
            models.MessageDeletion.user_id == user_id,
        )
        .first()
        is not None
    )


def _serialize_message(
    db: Session, message: models.Message, current_user_id: int
) -> schemas.MessageRead:
    sender = db.get(models.User, message.sender_id) if message.sender_id else None
    return schemas.MessageRead(
        id=message.id,
        thread_id=message.thread_id,
        sender_id=message.sender_id,
        body=message.body,
        parent_id=message.parent_id,
        forwarded_from_id=message.forwarded_from_id,
        created_at=message.created_at,
        is_read=_message_read_by(db, message.id, current_user_id),
        sender_name=sender.name or sender.username if sender else "Unknown",
    )


@router.get("/threads", response_model=list[schemas.ConversationRead])
def list_threads(db: Session = Depends(get_db), user=Depends(require_user)):
    participant_alias = db.query(models.MessageThreadParticipant).subquery()
    threads = (
        db.query(models.MessageThread)
        .join(
            models.MessageThreadParticipant,
            models.MessageThreadParticipant.thread_id == models.MessageThread.id,
        )
        .filter(models.MessageThreadParticipant.user_id == user.id)
        .order_by(models.MessageThread.id)
        .all()
    )

    result = []
    for thread in threads:
        participants = (
            db.query(models.User)
            .join(
                models.MessageThreadParticipant,
                models.MessageThreadParticipant.user_id == models.User.id,
            )
            .filter(models.MessageThreadParticipant.thread_id == thread.id)
            .all()
        )

        last_message = (
            db.query(models.Message)
            .filter(
                models.Message.thread_id == thread.id,
                ~models.Message.id.in_(
                    db.query(models.MessageDeletion.message_id).filter(
                        models.MessageDeletion.user_id == user.id
                    )
                ),
            )
            .order_by(models.Message.created_at.desc())
            .first()
        )

        unread = (
            db.query(models.Message)
            .filter(
                models.Message.thread_id == thread.id,
                models.Message.sender_id != user.id,
                ~models.Message.id.in_(
                    db.query(models.MessageReadReceipt.message_id).filter(
                        models.MessageReadReceipt.user_id == user.id
                    )
                ),
                ~models.Message.id.in_(
                    db.query(models.MessageDeletion.message_id).filter(
                        models.MessageDeletion.user_id == user.id
                    )
                ),
            )
            .count()
        )

        result.append(
            schemas.ConversationRead(
                thread=schemas.MessageThreadRead.model_validate(thread),
                participants=[
                    {"id": p.id, "name": p.name or p.username, "username": p.username}
                    for p in participants
                ],
                last_message=_serialize_message(db, last_message, user.id)
                if last_message
                else None,
                unread_count=unread,
            )
        )
    # Sort by most recent message time descending.
    result.sort(
        key=lambda c: c.last_message.created_at if c.last_message else thread.created_at,
        reverse=True,
    )
    return result


@router.get("/threads/{thread_id}", response_model=list[schemas.MessageRead])
def get_thread_messages(thread_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    participant_ids = _participant_ids(db, thread_id)
    if user.id not in participant_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    messages = (
        db.query(models.Message)
        .filter(
            models.Message.thread_id == thread_id,
            ~models.Message.id.in_(
                db.query(models.MessageDeletion.message_id).filter(
                    models.MessageDeletion.user_id == user.id
                )
            ),
        )
        .order_by(models.Message.created_at.asc())
        .all()
    )
    return [_serialize_message(db, m, user.id) for m in messages]


@router.get("/unread-count")
def unread_count(db: Session = Depends(get_db), user=Depends(require_user)):
    thread_ids = [
        p.thread_id
        for p in db.query(models.MessageThreadParticipant).filter(
            models.MessageThreadParticipant.user_id == user.id
        ).all()
    ]
    count = (
        db.query(models.Message)
        .filter(
            models.Message.thread_id.in_(thread_ids),
            models.Message.sender_id != user.id,
            ~models.Message.id.in_(
                db.query(models.MessageReadReceipt.message_id).filter(
                    models.MessageReadReceipt.user_id == user.id
                )
            ),
            ~models.Message.id.in_(
                db.query(models.MessageDeletion.message_id).filter(
                    models.MessageDeletion.user_id == user.id
                )
            ),
        )
        .count()
    )
    return {"count": count}


def _find_direct_thread(db: Session, user_a: int, user_b: int) -> Optional[models.MessageThread]:
    a_threads = {
        p.thread_id
        for p in db.query(models.MessageThreadParticipant).filter(
            models.MessageThreadParticipant.user_id == user_a
        ).all()
    }
    b_threads = {
        p.thread_id
        for p in db.query(models.MessageThreadParticipant).filter(
            models.MessageThreadParticipant.user_id == user_b
        ).all()
    }
    common = a_threads & b_threads
    for thread_id in common:
        thread = db.get(models.MessageThread, thread_id)
        if thread and not thread.is_group:
            participant_count = (
                db.query(models.MessageThreadParticipant)
                .filter(models.MessageThreadParticipant.thread_id == thread.id)
                .count()
            )
            if participant_count == 2:
                return thread
    return None


@router.post("", response_model=schemas.MessageRead)
def create_message(
    payload: schemas.MessageCreate, db: Session = Depends(get_db), user=Depends(require_user)
):
    if payload.thread_id:
        thread = db.get(models.MessageThread, payload.thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        participant_ids = _participant_ids(db, thread.id)
        if user.id not in participant_ids:
            raise HTTPException(status_code=403, detail="Access denied")
    else:
        recipient_ids = list(set(payload.recipient_ids))
        if not recipient_ids:
            raise HTTPException(status_code=400, detail="Recipient required")
        if user.id in recipient_ids:
            recipient_ids.remove(user.id)
        if not recipient_ids:
            raise HTTPException(status_code=400, detail="Cannot message only yourself")

        if len(recipient_ids) == 1 and not payload.name:
            existing = _find_direct_thread(db, user.id, recipient_ids[0])
            if existing:
                thread = existing
            else:
                thread = models.MessageThread(is_group=False, name="")
                db.add(thread)
                db.commit()
                db.refresh(thread)
                db.add_all(
                    [
                        models.MessageThreadParticipant(thread_id=thread.id, user_id=user.id),
                        models.MessageThreadParticipant(
                            thread_id=thread.id, user_id=recipient_ids[0]
                        ),
                    ]
                )
                db.commit()
        else:
            thread = models.MessageThread(is_group=True, name=payload.name or "Group")
            db.add(thread)
            db.commit()
            db.refresh(thread)
            participants = {user.id} | set(recipient_ids)
            db.add_all(
                [
                    models.MessageThreadParticipant(thread_id=thread.id, user_id=uid)
                    for uid in participants
                ]
            )
            db.commit()

    message = models.Message(
        thread_id=thread.id,
        sender_id=user.id,
        body=payload.body,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return _serialize_message(db, message, user.id)


@router.post("/{message_id}/reply", response_model=schemas.MessageRead)
def reply_to_message(
    message_id: int,
    payload: schemas.MessageCreate,
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    parent = db.get(models.Message, message_id)
    if not parent:
        raise HTTPException(status_code=404, detail="Message not found")
    participant_ids = _participant_ids(db, parent.thread_id)
    if user.id not in participant_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    message = models.Message(
        thread_id=parent.thread_id,
        sender_id=user.id,
        body=payload.body,
        parent_id=parent.id,
    )
    db.add(message)
    db.commit()
    db.refresh(message)
    return _serialize_message(db, message, user.id)


@router.post("/{message_id}/forward", response_model=list[schemas.MessageRead])
def forward_message(
    message_id: int,
    payload: schemas.MessageForwardRequest,
    db: Session = Depends(get_db),
    user=Depends(require_user),
):
    original = db.get(models.Message, message_id)
    if not original:
        raise HTTPException(status_code=404, detail="Message not found")
    if not _message_deleted_by(db, original.id, user.id):
        participant_ids = _participant_ids(db, original.thread_id)
        if user.id not in participant_ids:
            raise HTTPException(status_code=403, detail="Access denied")

    if payload.thread_id:
        thread = db.get(models.MessageThread, payload.thread_id)
        if not thread:
            raise HTTPException(status_code=404, detail="Thread not found")
        if user.id not in _participant_ids(db, thread.id):
            raise HTTPException(status_code=403, detail="Access denied")
        threads = [thread]
    elif payload.recipient_ids:
        threads = []
        for rid in set(payload.recipient_ids):
            if rid == user.id:
                continue
            existing = _find_direct_thread(db, user.id, rid)
            if existing:
                threads.append(existing)
            else:
                thread = models.MessageThread(is_group=False, name="")
                db.add(thread)
                db.commit()
                db.refresh(thread)
                db.add_all(
                    [
                        models.MessageThreadParticipant(thread_id=thread.id, user_id=user.id),
                        models.MessageThreadParticipant(thread_id=thread.id, user_id=rid),
                    ]
                )
                db.commit()
                threads.append(thread)
    else:
        raise HTTPException(status_code=400, detail="Target thread or recipients required")

    forwarded = []
    for thread in threads:
        body = f"Forwarded: {original.body}"
        message = models.Message(
            thread_id=thread.id,
            sender_id=user.id,
            body=body,
            forwarded_from_id=original.id,
        )
        db.add(message)
        db.commit()
        db.refresh(message)
        forwarded.append(_serialize_message(db, message, user.id))
    return forwarded


@router.patch("/{message_id}/read", response_model=schemas.MessageRead)
def mark_read(message_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    message = db.get(models.Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    participant_ids = _participant_ids(db, message.thread_id)
    if user.id not in participant_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    existing = (
        db.query(models.MessageReadReceipt)
        .filter(
            models.MessageReadReceipt.message_id == message.id,
            models.MessageReadReceipt.user_id == user.id,
        )
        .first()
    )
    if not existing:
        db.add(
            models.MessageReadReceipt(message_id=message.id, user_id=user.id)
        )
        db.commit()
    return _serialize_message(db, message, user.id)


@router.patch("/{message_id}/unread", response_model=schemas.MessageRead)
def mark_unread(message_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    message = db.get(models.Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    participant_ids = _participant_ids(db, message.thread_id)
    if user.id not in participant_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    db.query(models.MessageReadReceipt).filter(
        models.MessageReadReceipt.message_id == message.id,
        models.MessageReadReceipt.user_id == user.id,
    ).delete()
    db.commit()
    return _serialize_message(db, message, user.id)


@router.delete("/{message_id}")
def delete_message(message_id: int, db: Session = Depends(get_db), user=Depends(require_user)):
    message = db.get(models.Message, message_id)
    if not message:
        raise HTTPException(status_code=404, detail="Message not found")
    participant_ids = _participant_ids(db, message.thread_id)
    if user.id not in participant_ids:
        raise HTTPException(status_code=403, detail="Access denied")

    existing = (
        db.query(models.MessageDeletion)
        .filter(
            models.MessageDeletion.message_id == message.id,
            models.MessageDeletion.user_id == user.id,
        )
        .first()
    )
    if not existing:
        db.add(models.MessageDeletion(message_id=message.id, user_id=user.id))
        db.commit()
    return {"status": "deleted"}
