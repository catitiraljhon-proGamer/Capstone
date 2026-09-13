import {
  collections,
  type MessageDocument,
  type NotificationDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { recordAuditLog } from "@/lib/server/audit";
import { readSession } from "@/lib/server/session";
import type {
  MessageConversationDto,
  MessageDto,
  MessageRecipientRole,
} from "@/types/domain";
import { ObjectId, type Filter } from "mongodb";
import { NextResponse } from "next/server";
import { z } from "zod";

const recipientRoleSchema = z.enum(["admin", "billing-clerk"]);

const messageSchema = z.object({
  body: z.string().trim().min(1).max(4_000),
  customerId: z.string().optional(),
  recipientRole: recipientRoleSchema.optional(),
});

const readConversationSchema = z
  .object({
    customerId: z.string().optional(),
    all: z.boolean().optional(),
  })
  .refine((input) => input.customerId || input.all, {
    message: "Select a conversation or mark all messages as read.",
  });

function channelFilter(
  recipientRole: MessageRecipientRole,
): Filter<MessageDocument> {
  if (recipientRole === "admin") {
    return {
      $or: [
        { recipientRole: "admin" },
        { recipientRole: { $exists: false } },
      ],
    };
  }

  return { recipientRole: "billing-clerk" };
}

const conversationKey = (
  customerId: ObjectId,
  recipientRole: MessageRecipientRole,
) => `customer:${customerId.toHexString()}:recipient:${recipientRole}`;

function toMessageDto(message: MessageDocument): MessageDto {
  return {
    id: message._id.toHexString(),
    customerId: message.customerId.toHexString(),
    recipientRole: message.recipientRole ?? "admin",
    authorId: message.authorId.toHexString(),
    authorName: message.authorName,
    authorRole: message.authorRole,
    body: message.body,
    createdAt: message.createdAt.toISOString(),
  };
}

async function listStaffConversations(
  staffUserId: ObjectId,
  recipientRole: MessageRecipientRole,
) {
  const db = await getDatabase();
  const ownChannel = channelFilter(recipientRole);
  const [latestByCustomer, unreadByCustomer] = await Promise.all([
    db
      .collection<MessageDocument>(collections.messages)
      .aggregate<{
        _id: ObjectId;
        lastMessageAt: Date;
        lastMessagePreview: string;
        lastAuthorName: string;
        lastAuthorRole: MessageDocument["authorRole"];
      }>([
        { $match: ownChannel },
        { $sort: { createdAt: -1 } },
        {
          $group: {
            _id: "$customerId",
            lastMessageAt: { $first: "$createdAt" },
            lastMessagePreview: { $first: "$body" },
            lastAuthorName: { $first: "$authorName" },
            lastAuthorRole: { $first: "$authorRole" },
          },
        },
        { $sort: { lastMessageAt: -1 } },
      ])
      .toArray(),
    db
      .collection<MessageDocument>(collections.messages)
      .aggregate<{ _id: ObjectId; count: number }>([
        {
          $match: {
            ...ownChannel,
            authorRole: "customer",
            readByStaffIds: { $ne: staffUserId },
          },
        },
        { $group: { _id: "$customerId", count: { $sum: 1 } } },
      ])
      .toArray(),
  ]);
  const customers = latestByCustomer.length
    ? await db
        .collection<UserDocument>(collections.users)
        .find({ _id: { $in: latestByCustomer.map((item) => item._id) } })
        .toArray()
    : [];
  const customerNames = new Map(
    customers.map((customer) => [customer._id.toHexString(), customer.name]),
  );
  const unreadCounts = new Map(
    unreadByCustomer.map((item) => [item._id.toHexString(), item.count]),
  );

  return latestByCustomer
    .map<MessageConversationDto | null>((item) => {
      const id = item._id.toHexString();
      const customerName = customerNames.get(id);
      return customerName
        ? {
            customerId: id,
            customerName,
            recipientRole,
            lastMessageAt: item.lastMessageAt.toISOString(),
            lastMessagePreview: item.lastMessagePreview.slice(0, 140),
            lastAuthorName: item.lastAuthorName,
            lastAuthorRole: item.lastAuthorRole,
            unreadCount: unreadCounts.get(id) ?? 0,
          }
        : null;
    })
    .filter((item): item is MessageConversationDto => item !== null);
}

export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();

    const db = await getDatabase();
    const url = new URL(request.url);
    let recipientRole: MessageRecipientRole;

    if (session.role === "customer") {
      const parsedRecipient = recipientRoleSchema.safeParse(
        url.searchParams.get("recipientRole") ?? "admin",
      );
      if (!parsedRecipient.success) {
        return NextResponse.json(
          { error: "Choose Admin or Billing Clerk for this conversation." },
          { status: 400 },
        );
      }
      recipientRole = parsedRecipient.data;
    } else {
      recipientRole = session.role;
    }

    if (url.searchParams.get("summary") === "unread") {
      if (session.role === "customer") return forbidden();

      const unreadCount = await db
        .collection<MessageDocument>(collections.messages)
        .countDocuments({
          ...channelFilter(recipientRole),
          authorRole: "customer",
          readByStaffIds: { $ne: new ObjectId(session.id) },
        });

      return NextResponse.json({ unreadCount });
    }

    let conversations: MessageConversationDto[] = [];
    let customerId: ObjectId;

    if (session.role === "customer") {
      customerId = new ObjectId(session.id);
    } else {
      conversations = await listStaffConversations(
        new ObjectId(session.id),
        recipientRole,
      );
      const requestedId = url.searchParams.get("customerId");
      const selectedId =
        requestedId &&
        conversations.some((item) => item.customerId === requestedId)
          ? requestedId
          : null;

      if (!selectedId) {
        return NextResponse.json({
          messages: [],
          conversations,
          selectedCustomerId: null,
          recipientRole,
        });
      }
      customerId = new ObjectId(selectedId);
    }

    const messages = await db
      .collection<MessageDocument>(collections.messages)
      .find({ customerId, ...channelFilter(recipientRole) })
      .sort({ createdAt: 1 })
      .limit(500)
      .toArray();

    return NextResponse.json({
      messages: messages.map(toMessageDto),
      conversations,
      selectedCustomerId: customerId.toHexString(),
      recipientRole,
    });
  } catch (error) {
    return apiError(error);
  }
}

export async function PATCH(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role === "customer") return forbidden();

    const input = readConversationSchema.parse(await request.json());
    if (input.customerId && !ObjectId.isValid(input.customerId)) {
      return NextResponse.json(
        { error: "The customer conversation is invalid." },
        { status: 400 },
      );
    }

    const staffUserId = new ObjectId(session.id);
    const db = await getDatabase();
    const filter: Filter<MessageDocument> = {
      ...channelFilter(session.role),
      authorRole: "customer",
      readByStaffIds: { $ne: staffUserId },
    };

    if (!input.all && input.customerId) {
      filter.customerId = new ObjectId(input.customerId);
    }

    const result = await db
      .collection<MessageDocument>(collections.messages)
      .updateMany(filter, { $addToSet: { readByStaffIds: staffUserId } });

    const notificationFilter: Filter<NotificationDocument> = {
      userId: staffUserId,
      kind: "message",
      readAt: { $exists: false },
    };
    if (!input.all && input.customerId) {
      notificationFilter.entityId = new ObjectId(input.customerId);
    }
    await db
      .collection<NotificationDocument>(collections.notifications)
      .updateMany(notificationFilter, { $set: { readAt: new Date() } });

    return NextResponse.json({ markedRead: result.modifiedCount });
  } catch (error) {
    return apiError(error);
  }
}

export async function POST(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();

    const input = messageSchema.parse(await request.json());
    let customerId: ObjectId;
    let recipientRole: MessageRecipientRole;

    if (session.role === "customer") {
      customerId = new ObjectId(session.id);
      recipientRole = input.recipientRole ?? "admin";
    } else {
      recipientRole = session.role;
      if (!input.customerId || !ObjectId.isValid(input.customerId)) {
        return NextResponse.json(
          { error: "Select a customer conversation before sending." },
          { status: 400 },
        );
      }
      customerId = new ObjectId(input.customerId);
      const db = await getDatabase();
      const customer = await db
        .collection<UserDocument>(collections.users)
        .findOne({
          _id: customerId,
          role: "customer",
          status: "active",
        });
      if (!customer) return forbidden();
    }

    const authorId = new ObjectId(session.id);
    const message: MessageDocument = {
      _id: new ObjectId(),
      conversationKey: conversationKey(customerId, recipientRole),
      customerId,
      recipientRole,
      authorId,
      authorName: session.name,
      authorRole: session.role,
      body: input.body,
      createdAt: new Date(),
      readByStaffIds: session.role === "customer" ? [] : [authorId],
    };
    const db = await getDatabase();
    await db.collection<MessageDocument>(collections.messages).insertOne(message);

    try {
      if (session.role === "customer") {
        const recipients = await db
          .collection<UserDocument>(collections.users)
          .find(
            { role: recipientRole, status: "active" },
            { projection: { _id: 1 } },
          )
          .toArray();

        if (recipients.length > 0) {
          const preview =
            input.body.length > 140
              ? `${input.body.slice(0, 137)}…`
              : input.body;
          await db
            .collection<NotificationDocument>(collections.notifications)
            .insertMany(
            recipients.map((recipient) => ({
              _id: new ObjectId(),
              userId: recipient._id,
              title:
                recipientRole === "admin"
                  ? "New Admin concern"
                  : "New billing concern",
              body: `${session.name}: ${preview}`,
              href:
                recipientRole === "admin"
                  ? `/admin/messages?customerId=${customerId.toHexString()}`
                  : `/billing-clerk/messages?customerId=${customerId.toHexString()}`,
              kind: "message",
              entityId: customerId,
              createdAt: message.createdAt,
            })),
            );
        }
      } else {
        const notification: NotificationDocument = {
          _id: new ObjectId(),
          userId: customerId,
          title:
            recipientRole === "admin"
              ? "Admin replied to your message"
              : "Billing Clerk replied to your message",
          body:
            input.body.length > 180
              ? `${input.body.slice(0, 177)}…`
              : input.body,
          href: `/customer/messages?recipientRole=${recipientRole}`,
          kind: "message",
          entityId: customerId,
          createdAt: message.createdAt,
        };

        await db
          .collection<NotificationDocument>(collections.notifications)
          .insertOne(notification);
      }
    } catch (notificationError) {
      console.error("Message saved, but its notification could not be created.", notificationError);
    }

    await recordAuditLog({
      db,
      actor: session,
      action: "message.sent",
      entityType: "message",
      entityId: message._id,
      details: {
        recipient: recipientRole,
        customerId: customerId.toHexString(),
      },
      createdAt: message.createdAt,
    });

    return NextResponse.json(
      { message: toMessageDto(message) },
      { status: 201 },
    );
  } catch (error) {
    return apiError(error);
  }
}
