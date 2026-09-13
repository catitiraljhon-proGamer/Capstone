import {
  collections,
  type AuditLogDocument,
  type UserDocument,
} from "@/lib/database/collections";
import { getDatabase } from "@/lib/database/mongodb";
import { apiError, forbidden, unauthorized } from "@/lib/server/api";
import { readSession } from "@/lib/server/session";
import { type Filter, ObjectId } from "mongodb";
import { NextResponse } from "next/server";

const PAGE_SIZE = 15;
const MAX_SEARCH_LENGTH = 100;

function escapeRegularExpression(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function parsePositiveInteger(value: string | null, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed > 0 ? parsed : fallback;
}

function parseManilaDate(value: string | null, endOfDay: boolean) {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;

  const date = new Date(
    `${value}T${endOfDay ? "23:59:59.999" : "00:00:00.000"}+08:00`,
  );
  return Number.isNaN(date.getTime()) ? null : date;
}

function startOfTodayInManila() {
  const now = new Date();
  const manila = new Date(now.getTime() + 8 * 60 * 60 * 1000);
  return new Date(
    Date.UTC(
      manila.getUTCFullYear(),
      manila.getUTCMonth(),
      manila.getUTCDate(),
    ) -
      8 * 60 * 60 * 1000,
  );
}

export async function GET(request: Request) {
  try {
    const session = await readSession();
    if (!session) return unauthorized();
    if (session.role !== "admin") return forbidden();

    const url = new URL(request.url);
    const page = parsePositiveInteger(url.searchParams.get("page"), 1);
    const search = (url.searchParams.get("search") ?? "")
      .trim()
      .slice(0, MAX_SEARCH_LENGTH);
    const action = (url.searchParams.get("action") ?? "").trim();
    const entityType = (url.searchParams.get("entityType") ?? "").trim();
    const from = parseManilaDate(url.searchParams.get("from"), false);
    const to = parseManilaDate(url.searchParams.get("to"), true);

    if (from && to && from > to) {
      return NextResponse.json(
        { error: "The start date must be on or before the end date." },
        { status: 400 },
      );
    }

    const filter: Filter<AuditLogDocument> = {};
    if (search) {
      const expression = new RegExp(escapeRegularExpression(search), "i");
      filter.$or = [
        { actorName: expression },
        { action: expression },
        { entityType: expression },
      ];
    }
    if (action) filter.action = action;
    if (entityType) filter.entityType = entityType;
    if (from || to) {
      filter.createdAt = {
        ...(from ? { $gte: from } : {}),
        ...(to ? { $lte: to } : {}),
      };
    }

    const db = await getDatabase();
    const auditLogs = db.collection<AuditLogDocument>(collections.auditLogs);
    const today = startOfTodayInManila();
    const [
      documents,
      filteredTotal,
      total,
      todayTotal,
      actorGroups,
      actionGroups,
      entityTypeGroups,
    ] = await Promise.all([
        auditLogs
          .find(filter)
          .sort({ createdAt: -1, _id: -1 })
          .skip((page - 1) * PAGE_SIZE)
          .limit(PAGE_SIZE)
          .toArray(),
        auditLogs.countDocuments(filter),
        auditLogs.countDocuments(),
        auditLogs.countDocuments({ createdAt: { $gte: today } }),
        auditLogs
          .aggregate<{ _id: ObjectId }>([{ $group: { _id: "$actorId" } }])
          .toArray(),
        auditLogs
          .aggregate<{ _id: string }>([
            { $group: { _id: "$action" } },
            { $sort: { _id: 1 } },
          ])
          .toArray(),
        auditLogs
          .aggregate<{ _id: string }>([
            { $group: { _id: "$entityType" } },
            { $sort: { _id: 1 } },
          ])
          .toArray(),
      ]);

    const actorIds = [
      ...new Set(documents.map((document) => document.actorId.toHexString())),
    ];
    const users = actorIds.length
      ? await db
          .collection<UserDocument>(collections.users)
          .find(
            { _id: { $in: actorIds.map((id) => new ObjectId(id)) } },
            { projection: { role: 1 } },
          )
          .toArray()
      : [];
    const rolesById = new Map(
      users.map((user) => [user._id.toHexString(), user.role]),
    );

    return NextResponse.json({
      logs: documents.map((document) => ({
        id: document._id.toHexString(),
        actorId: document.actorId.toHexString(),
        actorName: document.actorName,
        actorRole:
          document.actorRole ??
          rolesById.get(document.actorId.toHexString()) ??
          ("unknown" as const),
        action: document.action,
        entityType: document.entityType,
        entityId: document.entityId?.toHexString(),
        details: document.details ?? {},
        createdAt: new Date(document.createdAt).toISOString(),
      })),
      pagination: {
        page,
        pageSize: PAGE_SIZE,
        total: filteredTotal,
        pageCount: Math.max(1, Math.ceil(filteredTotal / PAGE_SIZE)),
      },
      summary: {
        total,
        today: todayTotal,
        actors: actorGroups.length,
        eventTypes: actionGroups.length,
      },
      filters: {
        actions: actionGroups.map((group) => group._id).filter(Boolean),
        entityTypes: entityTypeGroups.map((group) => group._id).filter(Boolean),
      },
    });
  } catch (error) {
    return apiError(error);
  }
}
