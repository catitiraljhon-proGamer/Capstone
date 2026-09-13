# MongoDB data model

All relationships use MongoDB `ObjectId` values. Money is stored as numeric Philippine-peso amounts; presentation formatting belongs in the UI.

| Collection | Purpose | Important relationships |
| --- | --- | --- |
| `users` | Login identity, profile, role, and account status | Referenced by customer, author, reviewer, and uploader fields |
| `house_designs` | Design metadata, rate, images, selected materials, and publication status | `createdBy -> users` |
| `house_types` | Admin-editable design categories | Referenced by the `houseType` name in existing design records |
| `exterior_items` | Quantity rules and material/price choices used by estimates | Selection positions are stored in `house_designs.defaultSelections` |
| `reference_values` | Ordered reference lists such as finish levels | Queried by category |
| `projects` | Customer project, contract price, dates, and status | `customerId -> users`, `houseDesignId -> house_designs` |
| `design_requests` | Customer design requests, inspiration images, feasibility status, and completed design delivery | `customerId -> users`, optional project/design links, `completedBy -> users` |
| `cost_estimates` | Saved cost snapshots and approval status | Customer, project, and design links |
| `approvals` | Generic approval queue for workflow records | `customerId -> users`, `recordId` points to the collection named by `recordType` |
| `invoices` | Progress-billing stages and due status | Customer and project links |
| `payments` | Multiple payment methods and verification status | Customer/project links and optional invoice link |
| `messages` | Customer-isolated Admin and Billing Clerk conversations with unread staff alerts | `customerId + recipientRole` partitions threads; `authorId -> users`; `readByStaffIds -> users` records per-staff read state |
| `documents` | Project/customer file metadata | Customer/project/uploader links |
| `notifications` | Per-user message, project, design, schedule, billing, and account updates for every role | `userId -> users` |
| `audit_logs` | Actor, action, entity, and change metadata | `actorId -> users` and optional entity link |

The canonical TypeScript document shapes are in `src/lib/database/collections.ts`. The connection and index definitions are in `src/lib/database/mongodb.ts`.

The current image form stores compressed data URLs inside a design document. MongoDB documents have a 16 MB limit, so production deployment should move uploaded images to object storage and save only their URLs.
