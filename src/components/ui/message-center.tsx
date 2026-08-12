"use client";

import { MessageSquareText, Send } from "lucide-react";
import { FormEvent, useEffect, useMemo, useState } from "react";

type MessageRole = "Customer" | "Billing Clerk" | "Admin";

type Message = {
  id: string;
  author: MessageRole;
  body: string;
  createdAt: string;
};

type MessageCenterProps = {
  currentRole: MessageRole;
  title?: string;
};

const storageKey = "g4-builders-demo-messages";

function readMessages() {
  if (typeof window === "undefined") {
    return [];
  }

  try {
    const rawMessages = window.localStorage.getItem(storageKey);
    return rawMessages ? (JSON.parse(rawMessages) as Message[]) : [];
  } catch {
    return [];
  }
}

function formatTime(value: string) {
  return new Intl.DateTimeFormat("en", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

export function MessageCenter({
  currentRole,
  title = "Messages",
}: MessageCenterProps) {
  const [messages, setMessages] = useState<Message[]>(readMessages);
  const [body, setBody] = useState("");

  useEffect(() => {
    const handleStorage = (event: StorageEvent) => {
      if (event.key === storageKey) {
        setMessages(readMessages());
      }
    };

    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, []);

  const audienceLabel = useMemo(() => {
    if (currentRole === "Customer") {
      return "Billing Clerk and Admin can see customer messages.";
    }

    return "Customer messages appear here for staff review.";
  }, [currentRole]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedBody = body.trim();
    if (!trimmedBody) {
      return;
    }

    const nextMessages = [
      ...messages,
      {
        id: crypto.randomUUID(),
        author: currentRole,
        body: trimmedBody,
        createdAt: new Date().toISOString(),
      },
    ];

    window.localStorage.setItem(storageKey, JSON.stringify(nextMessages));
    setMessages(nextMessages);
    setBody("");
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
        <span className="rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-700">
          Shared
        </span>
      </div>

      <div className="mt-5 max-h-80 space-y-3 overflow-y-auto rounded-lg border border-stone-200 bg-stone-50 p-3">
        {messages.length > 0 ? (
          messages.map((message) => {
            const isOwnMessage = message.author === currentRole;

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
                    <span
                      className={
                        isOwnMessage ? "text-red-100" : "text-stone-500"
                      }
                    >
                      {message.author}
                    </span>
                    <span
                      className={
                        isOwnMessage ? "text-red-100" : "text-stone-400"
                      }
                    >
                      {formatTime(message.createdAt)}
                    </span>
                  </div>
                  <p className="leading-5">{message.body}</p>
                </div>
              </div>
            );
          })
        ) : (
          <div className="rounded-lg border border-dashed border-stone-200 bg-white p-6 text-center text-sm text-stone-500">
            No messages yet.
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="mt-4 flex gap-3">
        <label className="sr-only" htmlFor={`${currentRole}-message`}>
          Message
        </label>
        <input
          id={`${currentRole}-message`}
          value={body}
          onChange={(event) => setBody(event.target.value)}
          placeholder={
            currentRole === "Customer"
              ? "Message the billing clerk and admin"
              : "Reply to the customer"
          }
          className="min-w-0 flex-1 rounded-lg border border-stone-200 bg-white px-4 py-3 text-sm outline-none transition placeholder:text-stone-400 focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
        />
        <button
          type="submit"
          className="inline-flex items-center gap-2 rounded-lg bg-red-700 px-4 py-3 text-sm font-semibold text-white shadow-sm hover:bg-red-800"
        >
          <Send className="h-4 w-4" />
          Send
        </button>
      </form>
    </section>
  );
}
