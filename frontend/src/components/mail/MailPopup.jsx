import { useEffect, useState, useCallback, useRef } from "react";
import { X, Plus, Reply, Forward, Trash2, MailOpen, Mail } from "lucide-react";
import { request } from "../../api/client";
import { notify } from "../../utils/notify";
import NewMessageModal from "./NewMessageModal";

export default function MailPopup({ isOpen, onClose }) {
  const [conversations, setConversations] = useState([]);
  const [selectedThreadId, setSelectedThreadId] = useState(null);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [newMessageOpen, setNewMessageOpen] = useState(false);
  const [replyingTo, setReplyingTo] = useState(null);
  const [forwarding, setForwarding] = useState(null);
  const [renaming, setRenaming] = useState(false);
  const [renameValue, setRenameValue] = useState("");
  const messagesEndRef = useRef(null);
  const currentUser = JSON.parse(localStorage.getItem("inventory-user") || "{}");

  const loadConversations = useCallback(async () => {
    try {
      const data = await request("/api/messages/threads");
      setConversations(data || []);
    } catch (err) {
      setError(err.message);
    }
  }, []);

  const loadMessages = useCallback(async (threadId) => {
    if (!threadId) return;
    setLoading(true);
    try {
      const data = await request(`/api/messages/threads/${threadId}`);
      setMessages(data || []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    loadConversations();
    const interval = window.setInterval(loadConversations, 60000);
    return () => window.clearInterval(interval);
  }, [isOpen, loadConversations]);

  useEffect(() => {
    if (selectedThreadId) {
      loadMessages(selectedThreadId);
    } else {
      setMessages([]);
    }
  }, [selectedThreadId, loadMessages]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages]);

  async function handleSend(body) {
    if (!body.trim()) return;
    try {
      if (forwarding) {
        await request(`/api/messages/${forwarding.id}/forward`, {
          method: "POST",
          body: JSON.stringify({ recipient_ids: forwarding.recipient_ids }),
        });
        setForwarding(null);
        notify("Message forwarded");
      } else if (replyingTo) {
        await request(`/api/messages/${replyingTo.id}/reply`, {
          method: "POST",
          body: JSON.stringify({ body: body.trim() }),
        });
        setReplyingTo(null);
      } else if (selectedThreadId) {
        await request("/api/messages", {
          method: "POST",
          body: JSON.stringify({ thread_id: selectedThreadId, body: body.trim() }),
        });
      }
      if (selectedThreadId) loadMessages(selectedThreadId);
      loadConversations();
    } catch (err) {
      notify(err.message);
    }
  }

  async function handleMarkRead(messageId, read) {
    try {
      await request(`/api/messages/${messageId}/${read ? "read" : "unread"}`, {
        method: "PATCH",
      });
      loadMessages(selectedThreadId);
      loadConversations();
    } catch (err) {
      notify(err.message);
    }
  }

  async function handleDelete(messageId) {
    try {
      await request(`/api/messages/${messageId}`, { method: "DELETE" });
      loadMessages(selectedThreadId);
      loadConversations();
    } catch (err) {
      notify(err.message);
    }
  }

  function startForward(message) {
    setReplyingTo(null);
    setForwarding({ id: message.id, recipient_ids: [] });
  }

  function submitForward(recipientIds) {
    setForwarding((prev) => (prev ? { ...prev, recipient_ids: recipientIds } : null));
  }

  async function handleRename() {
    if (!selectedThreadId || !renameValue.trim()) return;
    try {
      await request(`/api/messages/threads/${selectedThreadId}`, {
        method: "PATCH",
        body: JSON.stringify({ name: renameValue.trim() }),
      });
      setRenaming(false);
      loadConversations();
      notify("Chat renamed");
    } catch (err) {
      notify(err.message);
    }
  }

  function startRename() {
    const conv = conversations.find((c) => c.thread.id === selectedThreadId);
    const currentName = conv?.thread?.name || "";
    setRenameValue(currentName);
    setRenaming(true);
  }

  const selectedThread = conversations.find((c) => c.thread.id === selectedThreadId);

  if (!isOpen) return null;

  return (
    <div className="mail-overlay" role="dialog" aria-modal="true" onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
      <div className="mail-popup">
        <div className="mail-popup-header">
          <h2>Messages</h2>
          <div className="mail-popup-actions">
            <button type="button" className="icon-button" onClick={() => setNewMessageOpen(true)} title="New message">
              <Plus size={18} />
            </button>
            <button type="button" className="icon-button" onClick={onClose} aria-label="Close messages">
              <X size={18} />
            </button>
          </div>
        </div>

        <div className="mail-popup-body">
          <div className="mail-conversation-list">
            {conversations.length === 0 && <p className="mail-empty">No conversations yet.</p>}
            {conversations.map((conv) => (
              <button
                key={conv.thread.id}
                type="button"
                className={`mail-conversation ${conv.thread.id === selectedThreadId ? "active" : ""}`}
                onClick={() => {
                  setSelectedThreadId(conv.thread.id);
                  setReplyingTo(null);
                  setForwarding(null);
                }}
              >
                <div className="mail-conversation-top">
                  <span className="mail-conversation-name">
                    {conv.thread.name || conv.participants.filter((p) => p.id !== currentUser.id).map((p) => p.name).join(", ") || "Me"}
                  </span>
                  {conv.unread_count > 0 && <span className="mail-unread-badge">{conv.unread_count}</span>}
                </div>
                {conv.last_message && (
                  <span className="mail-conversation-preview">
                    {conv.last_message.sender_name}: {conv.last_message.body}
                  </span>
                )}
              </button>
            ))}
          </div>

          <div className="mail-thread">
            {selectedThread ? (
              <>
                <div className="mail-thread-header">
                  {renaming ? (
                    <form
                      className="mail-rename-form"
                      onSubmit={(e) => { e.preventDefault(); handleRename(); }}
                    >
                      <input
                        value={renameValue}
                        onChange={(e) => setRenameValue(e.target.value)}
                        placeholder="Chat name"
                        autoFocus
                      />
                      <button type="submit">Save</button>
                      <button type="button" className="secondary" onClick={() => setRenaming(false)}>Cancel</button>
                    </form>
                  ) : (
                    <div className="mail-thread-title">
                      <h3>
                        {selectedThread.thread.name || selectedThread.participants.filter((p) => p.id !== currentUser.id).map((p) => p.name).join(", ") || "Me"}
                      </h3>
                      <button type="button" className="secondary" onClick={startRename}>Rename</button>
                    </div>
                  )}
                </div>

                <div className="mail-messages">
                  {loading && <p className="muted">Loading messages...</p>}
                  {!loading && messages.length === 0 && <p className="mail-empty">No messages.</p>}
                  {messages.map((msg) => {
                    const isMine = msg.sender_id === currentUser.id;
                    return (
                      <div key={msg.id} className={`mail-message ${isMine ? "mine" : ""}`}>
                        <div className="mail-message-bubble">
                          <div className="mail-message-meta">
                            <span className="mail-message-sender">{msg.sender_name}</span>
                            <span className="mail-message-time">
                              {msg.created_at ? new Date(msg.created_at).toLocaleString() : ""}
                            </span>
                          </div>
                          {msg.forwarded_from_id && <span className="mail-forwarded">Forwarded</span>}
                          <p className="mail-message-body">{msg.body}</p>
                          <div className="mail-message-actions">
                            {!isMine && !msg.is_read && (
                              <button type="button" onClick={() => handleMarkRead(msg.id, true)} title="Mark read">
                                <MailOpen size={12} />
                              </button>
                            )}
                            {!isMine && msg.is_read && (
                              <button type="button" onClick={() => handleMarkRead(msg.id, false)} title="Mark unread">
                                <Mail size={12} />
                              </button>
                            )}
                            <button type="button" onClick={() => { setReplyingTo(msg); setForwarding(null); }} title="Reply">
                              <Reply size={12} />
                            </button>
                            <button type="button" onClick={() => startForward(msg)} title="Forward">
                              <Forward size={12} />
                            </button>
                            <button type="button" onClick={() => handleDelete(msg.id)} title="Delete">
                              <Trash2 size={12} />
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                  <div ref={messagesEndRef} />
                </div>

                <ComposeArea
                  onSend={handleSend}
                  replyingTo={replyingTo}
                  forwarding={forwarding}
                  onCancelReply={() => setReplyingTo(null)}
                  onCancelForward={() => setForwarding(null)}
                  onSubmitForward={submitForward}
                />
              </>
            ) : (
              <div className="mail-empty-thread">
                <p>Select a conversation or start a new message.</p>
              </div>
            )}
          </div>
        </div>
      </div>

      {newMessageOpen && (
        <NewMessageModal
          isOpen={newMessageOpen}
          onClose={() => setNewMessageOpen(false)}
          onSent={() => {
            setNewMessageOpen(false);
            loadConversations();
          }}
        />
      )}

      {error && <p className="error mail-popup-error">{error}</p>}
    </div>
  );
}

function ComposeArea({ onSend, replyingTo, forwarding, onCancelReply, onCancelForward, onSubmitForward }) {
  const [text, setText] = useState("");
  const [forwardRecipients, setForwardRecipients] = useState([]);
  const [users, setUsers] = useState([]);
  const currentUser = JSON.parse(localStorage.getItem("inventory-user") || "{}");

  useEffect(() => {
    if (!forwarding) return;
    async function load() {
      try {
        const data = await request("/api/users");
        setUsers(data.filter((u) => u.id !== currentUser.id));
      } catch {
        // ignore
      }
    }
    load();
  }, [forwarding, currentUser.id]);

  function handleSubmit(event) {
    event.preventDefault();
    if (forwarding) {
      if (!forwardRecipients.length) return;
      onSubmitForward(forwardRecipients);
      setForwardRecipients([]);
      onSend("");
      return;
    }
    onSend(text);
    setText("");
  }

  function handleKeyDown(event) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      if (text.trim()) {
        handleSubmit(event);
      }
    }
  }

  if (forwarding) {
    return (
      <form className="mail-compose" onSubmit={handleSubmit}>
        <div className="mail-compose-context">
          <span>Forward to:</span>
          {users.map((u) => (
            <label key={u.id} className="mail-recipient-chip">
              <input
                type="checkbox"
                checked={forwardRecipients.includes(u.id)}
                onChange={() => setForwardRecipients((prev) =>
                  prev.includes(u.id) ? prev.filter((id) => id !== u.id) : [...prev, u.id]
                )}
              />
              {u.name || u.username}
            </label>
          ))}
          <button type="button" className="secondary" onClick={onCancelForward}>Cancel</button>
        </div>
        <button type="submit" disabled={!forwardRecipients.length}>Forward</button>
      </form>
    );
  }

  return (
    <form className="mail-compose" onSubmit={handleSubmit}>
      {replyingTo && (
        <div className="mail-compose-context">
          <span>Replying to {replyingTo.sender_name}</span>
          <button type="button" className="secondary" onClick={onCancelReply}>Cancel</button>
        </div>
      )}
      <div className="mail-compose-row">
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={replyingTo ? "Write a reply... (Enter to send, Shift+Enter for new line)" : "Type a message... (Enter to send, Shift+Enter for new line)"}
          rows={2}
          required
        />
        <button type="submit" disabled={!text.trim()}>Send</button>
      </div>
    </form>
  );
}
