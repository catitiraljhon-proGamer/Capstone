"use client";

import { Button } from "@/components/ui/button";
import { useModalBehavior } from "@/lib/use-modal-behavior";
import { clickableRowClass, clickableRowProps } from "@/components/ui/clickable-row";
import {
  roleLabels,
  type ManagedUserDto,
  type UserManagementSummary,
  type UserRole,
  type UserStatus,
} from "@/types/domain";
import {
  KeyRound,
  LoaderCircle,
  Pencil,
  ReceiptText,
  RefreshCw,
  Search,
  ShieldCheck,
  UserCheck,
  UserPlus,
  UserRound,
  UserRoundX,
  Users,
  X,
} from "lucide-react";
import { useCallback, useEffect, useMemo, useState } from "react";

type UserManagementPayload = {
  users: ManagedUserDto[];
  summary: UserManagementSummary;
  currentUserId: string;
};

type AccountForm = {
  name: string;
  email: string;
  password: string;
  role: UserRole;
  status: UserStatus;
};

const emptySummary: UserManagementSummary = {
  total: 0,
  active: 0,
  customers: 0,
  staff: 0,
  disabled: 0,
};

const emptyForm: AccountForm = {
  name: "",
  email: "",
  password: "",
  role: "customer",
  status: "active",
};

const fieldClass =
  "mt-1.5 h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15 disabled:cursor-not-allowed disabled:bg-stone-100 disabled:text-stone-500";

const roleBadgeClass: Record<UserRole, string> = {
  customer: "bg-stone-100 text-stone-700",
  "billing-clerk": "bg-amber-50 text-amber-800",
  admin: "bg-red-50 text-red-700",
};

const roleGuide = [
  {
    role: "customer" as const,
    title: "Customer",
    description: "Can manage personal projects, design requests, blueprints, and billing.",
    icon: UserRound,
  },
  {
    role: "billing-clerk" as const,
    title: "Billing Clerk",
    description: "Manages billings, invoices, payment verification, receipts, and customer balances.",
    icon: ReceiptText,
  },
  {
    role: "admin" as const,
    title: "Admin",
    description: "Manages projects, designs, users, roles, and project approvals.",
    icon: ShieldCheck,
  },
];

async function readJson<T>(response: Response): Promise<T> {
  const payload = (await response.json()) as T & {
    error?: string;
    issues?: { message?: string }[];
  };
  if (!response.ok) {
    throw new Error(
      payload.issues?.[0]?.message ??
        payload.error ??
        "The user account request could not be completed.",
    );
  }
  return payload;
}

function formatAccountDate(value: string) {
  return new Date(value).toLocaleDateString("en-PH", {
    year: "numeric",
    month: "short",
    day: "numeric",
  });
}

function initials(name: string) {
  return name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

export function AdminUsersRolesManager() {
  const [users, setUsers] = useState<ManagedUserDto[]>([]);
  const [summary, setSummary] =
    useState<UserManagementSummary>(emptySummary);
  const [currentUserId, setCurrentUserId] = useState("");
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<UserRole | "all">("all");
  const [statusFilter, setStatusFilter] = useState<UserStatus | "all">("all");
  const [page, setPage] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [form, setForm] = useState<AccountForm>(emptyForm);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadUsers = useCallback(async (refresh = false) => {
    if (refresh) setIsRefreshing(true);
    else setIsLoading(true);

    try {
      const response = await fetch("/api/users", { cache: "no-store" });
      const payload = await readJson<UserManagementPayload>(response);
      setUsers(payload.users);
      setSummary(payload.summary);
      setCurrentUserId(payload.currentUserId);
      setError(null);
    } catch (loadError) {
      setError(
        loadError instanceof Error
          ? loadError.message
          : "Unable to load user accounts.",
      );
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let active = true;

    fetch("/api/users", { cache: "no-store" })
      .then((response) => readJson<UserManagementPayload>(response))
      .then((payload) => {
        if (!active) return;
        setUsers(payload.users);
        setSummary(payload.summary);
        setCurrentUserId(payload.currentUserId);
        setError(null);
      })
      .catch((loadError: unknown) => {
        if (!active) return;
        setError(
          loadError instanceof Error
            ? loadError.message
            : "Unable to load user accounts.",
        );
      })
      .finally(() => {
        if (active) setIsLoading(false);
      });

    return () => {
      active = false;
    };
  }, []);

  const filteredUsers = useMemo(() => {
    const query = search.trim().toLowerCase();
    return users.filter((user) => {
      const matchesSearch =
        !query ||
        user.name.toLowerCase().includes(query) ||
        user.email.toLowerCase().includes(query);
      const matchesRole = roleFilter === "all" || user.role === roleFilter;
      const matchesStatus =
        statusFilter === "all" || user.status === statusFilter;
      return matchesSearch && matchesRole && matchesStatus;
    });
  }, [roleFilter, search, statusFilter, users]);

  const pageSize = 8;
  const pageCount = Math.max(1, Math.ceil(filteredUsers.length / pageSize));
  const visiblePage = Math.min(page, pageCount);
  const visibleUsers = filteredUsers.slice(
    (visiblePage - 1) * pageSize,
    visiblePage * pageSize,
  );

  const openCreateForm = () => {
    setEditingUserId(null);
    setForm(emptyForm);
    setError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  };

  const openEditForm = (user: ManagedUserDto) => {
    setEditingUserId(user.id);
    setForm({
      name: user.name,
      email: user.email,
      password: "",
      role: user.role,
      status: user.status,
    });
    setError(null);
    setSuccessMessage(null);
    setIsFormOpen(true);
  };

  const closeForm = () => {
    if (isSaving) return;
    setIsFormOpen(false);
    setEditingUserId(null);
    setForm(emptyForm);
  };

  useModalBehavior(isFormOpen, closeForm);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const disablingUser = editingUserId
      ? users.find((user) => user.id === editingUserId && user.status === "active")
      : undefined;
    if (
      disablingUser &&
      form.status === "disabled" &&
      !window.confirm(
        `Disable ${disablingUser.name}'s account? They will no longer be able to sign in.`,
      )
    ) {
      return;
    }
    setIsSaving(true);
    setError(null);
    setSuccessMessage(null);

    try {
      const isEditing = editingUserId !== null;
      const payload = {
        name: form.name,
        email: form.email,
        role: form.role,
        status: form.status,
        ...(!isEditing || form.password ? { password: form.password } : {}),
      };
      const response = await fetch(
        isEditing ? `/api/users/${editingUserId}` : "/api/users",
        {
          method: isEditing ? "PATCH" : "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        },
      );
      const result = await readJson<{ user: ManagedUserDto }>(response);
      setSuccessMessage(
        isEditing
          ? `${result.user.name}'s account was updated.`
          : `${result.user.name}'s account was created.`,
      );
      setIsFormOpen(false);
      setEditingUserId(null);
      setForm(emptyForm);
      await loadUsers(true);
    } catch (saveError) {
      setError(
        saveError instanceof Error
          ? saveError.message
          : "Unable to save the user account.",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const editingUser = editingUserId
    ? users.find((user) => user.id === editingUserId)
    : undefined;
  const isEditingCurrentUser = editingUserId === currentUserId;
  const roleCounts = users.reduce<Record<UserRole, number>>(
    (counts, user) => ({ ...counts, [user.role]: counts[user.role] + 1 }),
    { customer: 0, "billing-clerk": 0, admin: 0 },
  );

  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
        {[
          { label: "Total Accounts", value: summary.total, icon: Users },
          { label: "Active", value: summary.active, icon: UserCheck },
          { label: "Customers", value: summary.customers, icon: UserRound },
          { label: "Staff Access", value: summary.staff, icon: ShieldCheck },
          { label: "Disabled", value: summary.disabled, icon: UserRoundX },
        ].map((item) => (
          <section
            key={item.label}
            className="rounded-xl border border-stone-200 bg-white p-5 shadow-sm"
          >
            <div className="flex items-center justify-between gap-4">
              <div>
                <p className="text-sm text-stone-500">{item.label}</p>
                <p className="mt-2 text-3xl font-semibold tracking-tight">
                  {item.value}
                </p>
              </div>
              <span className="grid h-11 w-11 place-items-center rounded-lg bg-red-50 text-red-700">
                <item.icon className="h-5 w-5" aria-hidden="true" />
              </span>
            </div>
          </section>
        ))}
      </div>

      {error ? (
        <p
          role="alert"
          className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </p>
      ) : null}
      {successMessage ? (
        <p
          role="status"
          className="rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700"
        >
          {successMessage}
        </p>
      ) : null}

      {isFormOpen ? (
        <div
          className="fixed inset-0 z-50 flex overflow-y-auto bg-stone-950/45 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="user-form-title"
        >
          <button
            type="button"
            className="fixed inset-0 cursor-default"
            aria-label="Close account form"
            onClick={closeForm}
          />
        <section className="relative m-auto w-full max-w-2xl rounded-xl border border-stone-200 bg-white p-5 shadow-xl sm:p-6">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                {editingUser ? "Account Settings" : "New Access"}
              </p>
              <h2 id="user-form-title" className="mt-1 break-words text-xl font-semibold tracking-tight">
                {editingUser ? `Edit ${editingUser.name}` : "Create User Account"}
              </h2>
              <p className="mt-1 text-sm text-stone-600">
                {editingUser
                  ? "Update identity, role, status, or issue a temporary password."
                  : "Create an account and assign its access level before sharing the credentials."}
              </p>
            </div>
            <button
              type="button"
              onClick={closeForm}
              className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-stone-500 hover:bg-stone-100"
              aria-label="Close account form"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {isEditingCurrentUser ? (
            <p className="mt-4 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800">
              This is your signed-in account. Its role, status, and password are protected here.
            </p>
          ) : null}

          <form
            onSubmit={handleSubmit}
            className="mt-5 grid gap-4 sm:grid-cols-2"
          >
            <label className="text-sm font-medium text-stone-700">
              Full Name
              <input
                required
                minLength={2}
                maxLength={100}
                autoComplete="name"
                value={form.name}
                onChange={(event) =>
                  setForm((current) => ({ ...current, name: event.target.value }))
                }
                placeholder="Juan Dela Cruz"
                className={fieldClass}
              />
            </label>

            <label className="text-sm font-medium text-stone-700">
              Email Address
              <input
                required
                type="email"
                autoComplete="email"
                value={form.email}
                onChange={(event) =>
                  setForm((current) => ({ ...current, email: event.target.value }))
                }
                placeholder="name@example.com"
                className={fieldClass}
              />
            </label>

            <label className="text-sm font-medium text-stone-700">
              Role
              <select
                value={form.role}
                disabled={isEditingCurrentUser}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    role: event.target.value as UserRole,
                  }))
                }
                className={fieldClass}
              >
                <option value="customer">Customer</option>
                <option value="billing-clerk">Billing Clerk</option>
                <option value="admin">Admin</option>
              </select>
            </label>

            <label className="text-sm font-medium text-stone-700">
              Account Status
              <select
                value={form.status}
                disabled={isEditingCurrentUser}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    status: event.target.value as UserStatus,
                  }))
                }
                className={fieldClass}
              >
                <option value="active">Active</option>
                <option value="disabled">Disabled</option>
              </select>
            </label>

            <label className="text-sm font-medium text-stone-700 sm:col-span-2">
              {editingUser ? "New Temporary Password (optional)" : "Temporary Password"}
              <span className="relative block">
                <KeyRound className="pointer-events-none absolute left-3 top-4 h-4 w-4 text-stone-400" />
                <input
                  required={!editingUser}
                  disabled={isEditingCurrentUser}
                  type="password"
                  minLength={8}
                  maxLength={72}
                  autoComplete="new-password"
                  value={form.password}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      password: event.target.value,
                    }))
                  }
                  placeholder={editingUser ? "Leave unchanged" : "At least 8 characters"}
                  className={`${fieldClass} pl-9`}
                />
              </span>
            </label>


            <div className="flex flex-wrap justify-end gap-3 pt-1 sm:col-span-2">
              <Button type="submit" disabled={isSaving} className="min-w-32">
                {isSaving ? (
                  <LoaderCircle className="mr-2 h-4 w-4 animate-spin" />
                ) : editingUser ? (
                  <Pencil className="mr-2 h-4 w-4" />
                ) : (
                  <UserPlus className="mr-2 h-4 w-4" />
                )}
                {isSaving ? "Saving…" : editingUser ? "Save Changes" : "Create Account"}
              </Button>
              <Button type="button" variant="outline" onClick={closeForm} disabled={isSaving}>
                Cancel
              </Button>
            </div>
          </form>
        </section>
        </div>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-3">
        {roleGuide.map((item) => (
          <button
            key={item.role}
            type="button"
            aria-pressed={roleFilter === item.role}
            aria-controls="user-directory"
            onClick={() => {
              // Clicking the selected role again shows every account.
              setRoleFilter(roleFilter === item.role ? "all" : item.role);
              setPage(1);
              document.getElementById("user-directory")?.scrollIntoView({ behavior: "smooth", block: "start" });
            }}
            className={`rounded-xl border bg-white p-5 text-left shadow-sm transition hover:border-red-200 hover:bg-red-50/40 focus:outline-none focus-visible:ring-2 focus-visible:ring-red-600 ${
              roleFilter === item.role ? "border-red-300 ring-2 ring-red-600/10" : "border-stone-200"
            }`}
          >
            <div className="flex items-start gap-4">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-red-50 text-red-700">
                <item.icon className="h-5 w-5" />
              </span>
              <div>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{item.title}</span>
                  <span className="rounded-full bg-stone-100 px-2 py-0.5 text-xs font-semibold text-stone-600">
                    {roleCounts[item.role]}
                  </span>
                </div>
                <p className="mt-2 text-sm leading-5 text-stone-600">
                  {item.description}
                </p>
                <p className="mt-3 text-xs font-semibold text-red-700">
                  {roleFilter === item.role ? "Showing these accounts · Click to show all" : "Click to show these accounts"}
                </p>
              </div>
            </div>
          </button>
        ))}
      </div>

      <section id="user-directory" className="scroll-mt-28 overflow-hidden rounded-xl border border-stone-200 bg-white shadow-sm">
        <div className="flex flex-col gap-4 border-b border-stone-200 p-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <h2 className="text-lg font-semibold tracking-tight">User Directory</h2>
            <p className="mt-1 text-sm text-stone-600">
              Search accounts, review access, and disable access without removing account history.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => void loadUsers(true)}
              disabled={isRefreshing}
            >
              <RefreshCw className={`mr-2 h-4 w-4 ${isRefreshing ? "animate-spin" : ""}`} />
              Refresh
            </Button>
            <Button type="button" onClick={openCreateForm}>
              <UserPlus className="mr-2 h-4 w-4" />
              Add User
            </Button>
          </div>
        </div>

        <div className="grid gap-3 border-b border-stone-200 bg-stone-50 p-4 md:grid-cols-[minmax(0,1fr)_200px_180px]">
          <label className="relative block">
            <span className="sr-only">Search users</span>
            <Search className="pointer-events-none absolute left-3 top-3 h-4 w-4 text-stone-400" />
            <input
              type="search"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value);
                setPage(1);
              }}
              placeholder="Search by name or email"
              className="h-10 w-full rounded-lg border border-stone-200 bg-white pl-9 pr-3 text-sm outline-none transition focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
            />
          </label>
          <label>
            <span className="sr-only">Filter by role</span>
            <select
              value={roleFilter}
              onChange={(event) => {
                setRoleFilter(event.target.value as UserRole | "all");
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
            >
              <option value="all">All Roles</option>
              <option value="customer">Customer</option>
              <option value="billing-clerk">Billing Clerk</option>
              <option value="admin">Admin</option>
            </select>
          </label>
          <label>
            <span className="sr-only">Filter by status</span>
            <select
              value={statusFilter}
              onChange={(event) => {
                setStatusFilter(event.target.value as UserStatus | "all");
                setPage(1);
              }}
              className="h-10 w-full rounded-lg border border-stone-200 bg-white px-3 text-sm outline-none focus:border-red-600 focus:ring-2 focus:ring-red-600/15"
            >
              <option value="all">All Statuses</option>
              <option value="active">Active</option>
              <option value="disabled">Disabled</option>
            </select>
          </label>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center gap-2 p-12 text-sm text-stone-500">
            <LoaderCircle className="h-5 w-5 animate-spin" />
            Loading user accounts…
          </div>
        ) : visibleUsers.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs font-semibold uppercase tracking-wide text-stone-500">
                  <th className="border-b border-stone-200 px-5 py-3">User</th>
                  <th className="border-b border-stone-200 px-4 py-3">Role</th>
                  <th className="border-b border-stone-200 px-4 py-3">Status</th>
                  <th className="border-b border-stone-200 px-4 py-3">Created</th>
                </tr>
              </thead>
              <tbody>
                {visibleUsers.map((user) => {
                  const isCurrent = user.id === currentUserId;
                  return (
                    <tr
                      key={user.id}
                      {...clickableRowProps(`Edit ${user.name}`, () => openEditForm(user))}
                      className={clickableRowClass}
                    >
                      <td className="border-b border-stone-100 px-5 py-4">
                        <div className="flex items-center gap-3">
                          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-stone-100 text-xs font-bold text-stone-600">
                            {initials(user.name)}
                          </span>
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-2">
                              <p className="font-semibold text-stone-950">{user.name}</p>
                              {isCurrent ? (
                                <span className="rounded-full bg-red-50 px-2 py-0.5 text-[11px] font-semibold text-red-700">
                                  You
                                </span>
                              ) : null}
                            </div>
                            <p className="mt-0.5 truncate text-xs text-stone-500">
                              {user.email}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="border-b border-stone-100 px-4 py-4">
                        <span className={`rounded-md px-2 py-1 text-xs font-semibold ${roleBadgeClass[user.role]}`}>
                          {roleLabels[user.role]}
                        </span>
                      </td>
                      <td className="border-b border-stone-100 px-4 py-4">
                        <span
                          className={[
                            "inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold",
                            user.status === "active"
                              ? "bg-emerald-50 text-emerald-700"
                              : "bg-stone-100 text-stone-600",
                          ].join(" ")}
                        >
                          <span
                            className={`h-1.5 w-1.5 rounded-full ${user.status === "active" ? "bg-emerald-500" : "bg-stone-400"}`}
                          />
                          {user.status === "active" ? "Active" : "Disabled"}
                        </span>
                      </td>
                      <td className="border-b border-stone-100 px-4 py-4 text-stone-600">
                        {formatAccountDate(user.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="p-12 text-center">
            <Users className="mx-auto h-9 w-9 text-stone-300" />
            <p className="mt-3 font-semibold">No Matching Accounts</p>
            <p className="mt-1 text-sm text-stone-500">
              Try a different search or filter selection.
            </p>
          </div>
        )}

        {!isLoading && filteredUsers.length > 0 ? (
          <div className="flex flex-col gap-3 border-t border-stone-200 px-5 py-4 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-sm text-stone-500">
              Showing {(visiblePage - 1) * pageSize + 1}–
              {Math.min(visiblePage * pageSize, filteredUsers.length)} of {filteredUsers.length}
            </p>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={visiblePage <= 1}
                onClick={() => setPage((current) => Math.max(1, current - 1))}
              >
                Previous
              </Button>
              <span className="grid min-w-20 place-items-center text-sm text-stone-600">
                {visiblePage} of {pageCount}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={visiblePage >= pageCount}
                onClick={() => setPage((current) => Math.min(pageCount, current + 1))}
              >
                Next
              </Button>
            </div>
          </div>
        ) : null}
      </section>
    </div>
  );
}
