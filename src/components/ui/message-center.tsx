"use client";

import { useSessionUser } from "@/lib/session-store";
import { markNotificationsRead } from "@/lib/customer-notifications";
import { staffMessageStatusEvent } from "@/lib/staff-message-notifications";
import {
  roleLabels,
  type MessageConversationDto,
  type MessageDto,
  type MessageRecipientRole,
} from "@/types/domain";
import { MessageSquareText, ReceiptText, Send, ShieldCheck } from "lucide-react";
import {
  FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

type MessageRole = "Customer" | "Billing Clerk" | "Admin";

type MessageCenterProps = {
  currentRole: MessageRole;
  title?: string;
  initialRecipientRole?: MessageRecipientRole;
  initialCustomerId?: string | null;
};

const recipientDetails = {
  admin: {
    label: "Admin",
    description: "Project, design, schedule, approval, document, or account concerns",
    icon: ShieldCheck,
  },
  "billing-clerk": {
    label: "Billing Clerk",
    description: "Invoices, payment records, balances, and progress billing concerns",
    icon: ReceiptText,
  },
} satisfies Record<
  MessageRecipientRole,
  { label: string; description: string; icon: typeof ShieldCheck }
>;

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en-PH", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessageCenter({
  currentRole,
  title = "Messages",
  initialRecipientRole = "admin",
  initialCustomerId = null,
}: MessageCenterProps) {
  const { user } = useSessionUser();
  const [messages, setMessages] = useState<MessageDto[]>([]);
  const [conversations, setConversations] = useState<MessageConversationDto[]>([]);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(
    initialCustomerId,
  );
  const [selectedRecipientRole, setSelectedRecipientRole] =
    useState<MessageRecipientRole>(initialRecipientRole);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSending, setIsSending] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const isStaff = currentRole !== "Customer";
  const activeRecipientRole: MessageRecipientRole = isStaff
    ? currentRole === "Admin"
      ? "admin"
      : "billing-clerk"
    : selectedRecipientRole;

  const loadMessages = useCallback(async () => {
    try {
      const query = new URLSearchParams();
      if (isStaff && selectedCustomerId) {
        query.set("customerId", selectedCustomerId);
      }
      if (!isStaff) {
        query.set("recipientRole", selectedRecipientRole);
      }
      const queryString = query.toString();
      const response = await fetch(
        `/api/messages${queryString ? `?${queryString}` : ""}`,
        { cache: "no-store" },
      );
      const payload = (await response.json()) as {
        messages?: MessageDto[];
        conversations?: MessageConversationDto[];
        selectedCustomerId?: string | null;
        error?: string;
      };

      if (!response.ok || !payload.messages) {
        throw new Error(payload.error ?? "Unable to load messages.");
      }

      const nextSelectedCustomerId = payload.selectedCustomerId ?? null;
      let nextConversations = payload.conversations ?? [];

      if (isStaff && nextSelectedCustomerId) {
        const selectedConversation = nextConversations.find(
          (conversation) => conversation.customerId === nextSelectedCustomerId,
        );

        if (selectedConversation && selectedConversation.unreadCount > 0) {
          try {
            const readResponse = await fetch("/api/messages", {
              method: "PATCH",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ customerId: nextSelectedCustomerId }),
            });

            if (readResponse.ok) {
              nextConversations = nextConversations.map((conversation) =>
                conversation.customerId === nextSelectedCustomerId
                  ? { ...conversation, unreadCount: 0 }
                  : conversation,
              );
              window.dispatchEvent(new Event(staffMessageStatusEvent));
            }
          } catch {
            // Messages remain visible even if their read receipt cannot be saved yet.
          }
        }
      } else if (!isStaff) {
        try {
          await markNotificationsRead({
            href: `/customer/messages?recipientRole=${selectedRecipientRole}`,
          });
        } catch {
          // The conversation remains usable if notification read state is unavailable.
        }
      }

      setMessages((current) => {
        const currentLastId = current[current.length - 1]?.id;
        const nextLastId = payload.messages?.[payload.messages.length - 1]?.id;

        return current.length === payload.messages?.length && currentLastId === nextLastId
          ? current
          : payload.messages ?? [];
      });
      setConversations(nextConversations);
      setSelectedCustomerId(nextSelectedCustomerId);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error ? loadError.message : "Unable to load messages.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [isStaff, selectedCustomerId, selectedRecipientRole]);

  useEffect(() => {
    const initialLoad = window.setTimeout(() => void loadMessages(), 0);
    const timer = window.setInterval(() => void loadMessages(), 3_000);
    const handleRefresh = () => void loadMessages();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void loadMessages();
    };

    window.addEventListener("focus", handleRefresh);
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      window.clearTimeout(initialLoad);
      window.clearInterval(timer);
      window.removeEventListener("focus", handleRefresh);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [loadMessages]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages]);

  const audienceLabel = useMemo(() => {
    if (currentRole === "Customer") {
      return `This conversation goes only to ${recipientDetails[selectedRecipientRole].label}. Choose the team that matches your concern.`;
    }

    return currentRole === "Admin"
      ? "Only project and administrative concerns addressed to Admin appear here."
      : "Only invoice and payment concerns addressed to Billing Clerk appear here.";
  }, [currentRole, selectedRecipientRole]);

  const selectedConversation = useMemo(
    () =>
      conversations.find(
        (conversation) => conversation.customerId === selectedCustomerId,
      ) ?? null,
    [conversations, selectedCustomerId],
  );

  const totalUnread = useMemo(
    () => conversations.reduce((total, conversation) => total + conversation.unreadCount, 0),
    [conversations],
  );

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedBody = body.trim();
    if (!trimmedBody || isSending) return;

    setIsSending(true);
    try {
      const response = await fetch("/api/messages", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          body: trimmedBody,
          customerId: isStaff ? selectedCustomerId : undefined,
          recipientRole: isStaff ? undefined : selectedRecipientRole,
        }),
      });
      const payload = (await response.json()) as {
        message?: MessageDto;
        error?: string;
      };

      if (!response.ok || !payload.message) {
        throw new Error(payload.error ?? "Unable to send the message.");
      }

      setMessages((current) => [...current, payload.message as MessageDto]);
      if (isStaff && selectedCustomerId) {
        setConversations((current) =>
          current.map((conversation) =>
            conversation.customerId === selectedCustomerId
              ? {
                  ...conversation,
                  lastMessageAt: payload.message?.createdAt ?? conversation.lastMessageAt,
                  lastMessagePreview: payload.message?.body ?? conversation.lastMessagePreview,
                  lastAuthorName: payload.message?.authorName ?? conversation.lastAuthorName,
                  lastAuthorRole: payload.message?.authorRole ?? conversation.lastAuthorRole,
                }
              : conversation,
          ),
        );
      }
      setBody("");
      setError(null);
    } catch (sendError) {
      setError(
        sendError instanceof Error ? sendError.message : "Unable to send the message.",
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <section className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <MessageSquareText className="h-5 w-5 text-red-700" />
            <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
          </div>
          <p className="mt-1 text-sm text-stone-500">{audienceLabel}</p>
        </div>
        <span
          className="shrink-0 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700"
          aria-live="polite"
        >
          {isStaff
            ? `${totalUnread} unread`
            : `To: ${recipientDetails[selectedRecipientRole].label}`}
        </span>
      </div>

      {!isStaff ? (
        <div className="mt-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
            Who should receive this concern?
          </p>
          <div className="mt-2 grid gap-3 md:grid-cols-2">
            {(Object.keys(recipientDetails) as MessageRecipientRole[]).map(
              (recipientRole) => {
                const details = recipientDetails[recipientRole];
                const isSelected = selectedRecipientRole === recipientRole;
                return (
                  <button
                    key={recipientRole}
                    type="button"
                    aria-pressed={isSelected}
                    onClick={() => {
                      if (isSelected) return;
                      setSelectedRecipientRole(recipientRole);
                      setMessages([]);
                      setBody("");
                      setError(null);
                      setIsLoading(true);
                      const nextUrl = new URL(window.location.href);
                      nextUrl.searchParams.set("recipientRole", recipientRole);
                      window.history.replaceState(null, "", nextUrl);
                    }}
                    className={[
                      "flex items-start gap-3 rounded-xl border p-4 text-left transition",
                      isSelected
                        ? "border-red-300 bg-red-50 shadow-sm ring-1 ring-red-200"
                        : "border-stone-200 bg-white hover:border-red-200 hover:bg-red-50/40",
                    ].join(" ")}
                  >
                    <span
                      className={[
                        "grid h-10 w-10 shrink-0 place-items-center rounded-lg",
                        isSelected
                          ? "bg-red-700 text-white"
                          : "bg-stone-100 text-stone-600",
                      ].join(" ")}
                    >
                      <details.icon className="h-5 w-5" />
                    </span>
                    <span>
                      <span className="block text-sm font-semibold text-stone-950">
                        {details.label}
                      </span>
                      <span className="mt-1 block text-xs leading-5 text-stone-600">
                        {details.description}
                      </span>
                    </span>
                  </button>
                );
              },
            )}
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </p>
      ) : null}

      <div
        className={[
          "mt-5 gap-4",
          isStaff ? "grid lg:grid-cols-[300px_minmax(0,1fr)]" : "",
        ].join(" ")}
      >
        {isStaff ? (
          <aside className="rounded-lg border border-stone-200 bg-stone-50 p-3">
            <div className="flex items-center justify-between gap-3 px-2 pb-3">
              <h3 className="text-sm font-semibold text-stone-950">Client senders</h3>
              <span className="text-xs text-stone-500">Newest first</span>
            </div>
            <div className="max-h-[32rem] space-y-2 overflow-y-auto">
              {conversations.length > 0 ? (
                conversations.map((conversation) => {
                  const isSelected = conversation.customerId === selectedCustomerId;

                  return (
                    <button
                      key={conversation.customerId}
                      type="button"
                      aria-pressed={isSelected}
                      onClick={() => {
                        if (isSelected) return;
                        setSelectedCustomerId(conversation.customerId);
                        setMessages([]);
                        setIsLoading(true);
                      }}
                      className={[
                        "w-full rounded-lg border p-3 text-left transition",
                        isSelected
                          ? "border-red-200 bg-white shadow-sm"
                          : "border-transparent hover:border-stone-200 hover:bg-white",
                      ].join(" ")}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <p className="min-w-0 truncate text-sm font-semibold text-stone-950">
                          {conversation.customerName}
                        </p>
                        {conversation.unreadCount > 0 ? (
                          <span className="shrink-0 rounded-full bg-red-700 px-2 py-0.5 text-xs font-semibold text-white">
                            {conversation.unreadCount} new
                          </span>
                        ) : null}
                      </div>
                      <p className="mt-1 line-clamp-2 text-xs leading-5 text-stone-600">
                        {conversation.lastAuthorRole === "customer"
                          ? `${conversation.customerName}: `
                          : `${conversation.lastAuthorName}: `}
                        {conversation.lastMessagePreview}
                      </p>
                      <time
                        dateTime={conversation.lastMessageAt}
                        className="mt-2 block text-xs text-stone-400"
                      >
                        {formatTime(conversation.lastMessageAt)}
                      </time>
                    </button>
                  );
                })
              ) : (
                <p className="rounded-lg border border-dashed border-stone-200 bg-white p-5 text-center text-sm text-stone-500">
                  No client messages yet.
                </p>
              )}
            </div>
          </aside>
        ) : null}

        <div className={isStaff ? "min-w-0" : ""}>
          {isStaff ? (
            <div className="mb-3 flex min-h-10 items-center justify-between gap-3 rounded-lg border border-stone-200 px-4 py-2">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Conversation with
                </p>
                <p className="text-sm font-semibold text-stone-950">
                  {selectedConversation?.customerName ?? "Select a client"}
                </p>
              </div>
              {selectedConversation?.unreadCount === 0 ? (
                <span className="text-xs font-medium text-stone-500">Read</span>
              ) : null}
            </div>
          ) : (
            <div className="mb-3 flex min-h-12 items-center gap-3 rounded-lg border border-stone-200 px-4 py-2.5">
              {selectedRecipientRole === "admin" ? (
                <ShieldCheck className="h-5 w-5 text-red-700" />
              ) : (
                <ReceiptText className="h-5 w-5 text-red-700" />
              )}
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-stone-500">
                  Private conversation with
                </p>
                <p className="text-sm font-semibold text-stone-950">
                  {recipientDetails[selectedRecipientRole].label}
                </p>
              </div>
            </div>
          )}

          <div className="max-h-[28rem] min-h-80 space-y-3 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3">
            {isLoading ? (
              <div className="p-6 text-center text-sm text-stone-500">Loading messages…</div>
            ) : messages.length > 0 ? (
              messages.map((message) => {
                const isOwnMessage = user?.id === message.authorId;

                return (
                  <div
                    key={message.id}
                    className={`flex ${isOwnMessage ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={[
                        "max-w-[86%] rounded-lg px-4 py-3 text-sm shadow-sm",
                        isOwnMessage
                          ? "bg-red-700 text-white"
                          : "border border-stone-200 bg-white text-stone-800",
                      ].join(" ")}
                    >
                      <div className="mb-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
                        <span className={isOwnMessage ? "text-red-100" : "text-stone-500"}>
                          {message.authorName} · {roleLabels[message.authorRole]}
                        </span>
                        <span className={isOwnMessage ? "text-red-100" : "text-stone-400"}>
                          {formatTime(message.createdAt)}
                        </span>
                      </div>
                      <p className="whitespace-pre-wrap leading-5">{message.body}</p>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="grid min-h-72 place-items-center rounded-lg border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
                {isStaff && !selectedCustomerId
                  ? "Select a client conversation."
                  : `No messages with ${recipientDetails[activeRecipientRole].label} yet. Send the first message below.`}
              </div>
            )}
            <div ref={messagesEndRef} aria-hidden="true" />
          </div>

          <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
            <label htmlFor="message-body" className="sr-only">
              Message
            </label>
            <textarea
              id="message-body"
              value={body}
              onChange={(event) => setBody(event.target.value)}
              rows={2}
              maxLength={4_000}
              placeholder={
                isStaff && !selectedCustomerId
                  ? "Select a client before replying…"
                  : `Write to ${recipientDetails[activeRecipientRole].label}…`
              }
              disabled={isStaff && !selectedCustomerId}
              className="min-h-12 flex-1 resize-none rounded-lg border border-stone-200 px-3 py-3 text-sm outline-none placeholder:text-stone-400 focus:border-red-600 disabled:cursor-not-allowed disabled:bg-stone-100"
            />
            <button
              type="submit"
              disabled={isSending || !body.trim() || (isStaff && !selectedCustomerId)}
              className="inline-flex h-12 items-center gap-2 self-end rounded-lg bg-red-700 px-5 text-sm font-semibold text-white hover:bg-red-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Send className="h-4 w-4" />
              {isSending ? "Sending…" : "Send"}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
