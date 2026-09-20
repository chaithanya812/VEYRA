# VEYRA Site Inventory

Complete route / action / schema map, derived from source (no browser). Cite `path:line`.
Nav tree: `lib/nav.ts:68-186` (six groups: Sales, Execution, Operations, Accounting, HR, Admin + Dashboard).
Permission registry (all capability keys): `lib/can-model.ts:51-131`. Server guard wrappers `can`/`requireCan`/`canAll`: `lib/data/permissions.ts`.

Login is currently REMOVED — every route resolves to a pinned DEMO tenant (`lib/data/with-org.ts:13,57-94`); RLS is OFF, isolation is `withOrg()` only.

---

## PART 1 — ROUTE INVENTORY (by area)

### DASHBOARD
- **`/dashboard`** (`app/(app)/dashboard/page.tsx`) — the personal workspace. Tab shell (`workspace-shell.tsx`): **My-work tabs** Overview · My info · Tasks · Expenses · Field visits (`workspace-shell.tsx:49-55`). Team tabs (Overview/Team/Task board/Approvals/Setup, `:57-63`) exist but are **PARKED** behind `TEAM_VIEW_ENABLED = false` (`workspace-shell.tsx:73`). Buttons across panels: check in/out, create/update task + checklist, request/cancel leave, submit expense, start/end field visit, upsert/retire workspace option, update member. Actions → `dashboard/actions.ts`.

### SALES (`lib/nav.ts:71-86`)
- **`/leads`** — Lead Management list (`leads/page.tsx`, `leads-table.tsx`). Add lead, edit, set status, set assignees, add remark, promote-to-project, follow-up create/complete/reschedule/cancel, log call. Actions → `leads/actions.ts`.
- **`/leads/new`** — New lead form (`leads/new/new-lead-form.tsx`) → `createLeadAction`.
- **`/leads/[id]`** — Lead detail (`leads/[id]/lead-detail.tsx`): status, assignees, remarks, follow-ups, promote to project.
- **`/leads/insights`** — Lead Insights analytics (`leads/insights/insights-view.tsx`), read-only.
- **`/pipeline`** — Kanban board (`pipeline/pipeline-board.tsx`); create/complete follow-up. Being replaced by funnel (`nav.ts:78-81`). Actions → `pipeline/actions.ts`.
- **`/followups`** — Follow-ups list (`followups/followups-view.tsx`); reuses lead follow-up actions.
- **`/quotations`** — Quotation list + Templates/New buttons (`quotations/page.tsx:17-30`). (Full detail in VEYRA-BUILD-MAP.md.)
- **`/quotations/new`** — create; source toggle Lead/Project/Standalone, **doc_type Regular/Modular/Budget/Revision** (`new-quotation-form.tsx:165-172`).
- **`/quotations/[id]`** — builder + action bar: Status set, Raise material request (if approved), Create/Disable share link, Save as template, Download PDF, New version, compare-version links (`quotations/[id]/page.tsx:99-191`).
- **`/quotations/[id]/compare/[otherId]`** — version diff.
- **`/quotations/templates`** — preset list; instantiate / delete template.
- **`/communication`** — call/interaction log (`communication/page.tsx`, `log-interaction-dialog.tsx`) → `logInteractionAction`.

### EXECUTION (`lib/nav.ts:88-109`)
- **`/projects`** — portfolio list (`projects/page.tsx`): tiles (portfolio value, count, delayed, handover this month), **stage filter** GET form, Milestones cell per row, New project button.
- **`/projects/new`** — create project (`projects/new/page.tsx`) → `createProjectAction`.
- **`/projects/[id]`** — project workspace (`project-workspace.tsx`): **page tabs Summary · Modules** (`:52-55`). Summary = site photos, documents, updates, project financials (Hide/Show money toggle `:282`), Milestones/Procurement segmented panel. Modules tab = 11 live module cards + 2 "soon" (MB sheet, 2D→3D renders, `:581-584`). Header: View report button, stage control, add note.
- **`/projects/[id]/plan`** — **Project Planning** (`plan/plan-view.tsx`): tabs **Milestone · Gantt chart · Tasks** (`:80-84`). Add scope, Add milestone, Start from template, SmartPlan (AI) per scope group, edit progress/status/assignee/client-visible/remark inline, dependency linker, delete. Actions → `plan/actions.ts` + `dashboard`/project task actions.
- **`/projects/[id]/procurement`** — project-scoped Procurement (same `procurement-view.tsx`, see Operations).
- **`/projects/[id]/site`** — site progress (`site-progress-view.tsx`): add progress, update/visibility/delete photo, photo comments. Actions → `projects/[id]/site/actions.ts`.
- **`/projects/[id]/documents`** & **`/[fileId]`** — folders/files, versions, client-approval, comment thread. Actions → `documents/actions.ts`.
- **`/projects/[id]/finance`** — Financial planning (`finance-view.tsx`, `schedule-editor.tsx`): inflow/outflow contracts, milestone schedule, record payment. Actions → `projects/[id]/finance/actions.ts`.
- **`/projects/[id]/payments`** — project payments ledger (`payments-view.tsx`): add entry, reverse entry. Actions → `projects/[id]/payments/actions.ts`.
- **`/projects/[id]/labour`** — daily labour report (`labour-view.tsx`): add/update/delete attendance, visibility toggle. Actions → `projects/[id]/labour/actions.ts`.
- **`/projects/[id]/report`** — client progress report builder (`report/report-builder.tsx`), read/compose.
- **`/projects/[id]/production`** — this project's BOMs/cutlists (subset of `/production`).
- **`/site`** — company Site execution (`site/page.tsx`): tabs **Daily logs · Photos · Attendance · Measurement variance** (`site/page.tsx:37-42`). Add log, add photo (pasted URL, no upload v1 `:34`), check-in/out, add variance. Actions → `site/actions.ts`.
- **`/production`** — Production hub (`production/page.tsx`): sections **BOMs · Cutlists · Sheet nesting · Panel traceability(QR) · Work centers**. Create BOM, Create cutlist, Run nesting, Generate tags, advance panel stage, Add work center. Actions → `production/actions.ts` (+ nesting/panel forms).
- **`/design`** — design assets gallery (`design/page.tsx`): add asset, comment, sign-off. Actions → `design/actions.ts`.
- **`/design/prompts`** — AI design-prompt library (`design/prompts/`): create/retire prompt, composer. Actions → `design/prompts/actions.ts`.
- **soon (nav only, inert):** `/projects/insights`, `/projects/mb-sheets`, `/projects/renders` (`nav.ts:95-104`, `soon:true`).

### OPERATIONS (`lib/nav.ts:111-126`)
- **`/procurement`** — company-wide procurement (`procurement/page.tsx`), same component as project scope. Sub-tabs **Requests · RFQs · Orders · Deliveries · Inventory** (`material-requests-model` PROC_TABS; `procurement-view.tsx:174-193`). Company adds Project column + project filter + All/Draft toggle (`:198-242`). Raise request (2-step wizard `:971`), move line-item stages, delete request. Server tab via `?view=`. Actions → `procurement/actions.ts` (company) & `projects/[id]/procurement/actions.ts` (project).
- **`/procurement/[id]`** — request detail (`procurement/[id]/`, `add-item-form.tsx`): add/remove MR item, update stage.
- **`/procurement/new`** — new material request (`procurement/new/page.tsx`).
- **`/rfq`** — RFQ list (`rfq/page.tsx`); **`/rfq/new`** create; **`/rfq/[id]`** detail: enter bid (`enter-bid-form.tsx`), award (`award-dialog.tsx`). Actions → `rfq/actions.ts`.
- **`/orders`** — purchase/work orders list (`orders/page.tsx`): multi-select order-state + payment-state + vendor filters, two status chips/row, Create Order. **`/orders/new`** create; **`/orders/[id]`** detail: update order/payment state, record receipt (`receive-goods-form.tsx`). Actions → `orders/actions.ts`.
- **`/inventory`** — Inventory (`inventory/inventory-view.tsx`): tabs **Warehouses · Deliveries StockIn · Expense StockIn · Transaction History · Material search** (`INVENTORY_TABS`). Warehouse scope Company/Project/Project-removed. Add/archive/restore warehouse, book-in links. **`/inventory/stock-in`** stock-in form. Actions → `inventory/actions.ts`.
- **`/vendors`** — vendor list + search (`vendors/page.tsx`); **`/vendors/new`**, **`/vendors/[id]`** (rate contracts, categories, projects), **`/vendors/[id]/projects`**. Create/update/deactivate vendor, set status, add rate contract. Actions → `vendors/actions.ts`.
- **`/items`** — item master (`items/page.tsx`): type filter, search. **`/items/new`**, **`/items/[id]`**, **`/items/import`** (CSV bulk). Create/update/toggle-active/import. Actions → `items/actions.ts`.

### ACCOUNTING (`lib/nav.ts:128-155`)
- **`/finance`** — contracts + cash tiles (Contract value / Inflow / Outflow / P&L) (`finance/page.tsx`). Guarded `billing.payment.view` (`:24`). New Contract. **`/finance/new`** create; **`/finance/[id]`** detail: payment-form, milestone-toggle. Actions → `finance/actions.ts`.
- **`/finance/payments`** — company Payments Dashboard (every project's receivables/payables). Read; save/delete saved view, meter export (`finance/actions.ts`).
- **`/finance/petty`** — Petty Finance (`petty-controls.tsx`): My Expense/My Fund self-service + approvals. Record entry (ungated self-service), reverse entry, decide claim. Actions → `finance/petty/actions.ts`.
- **`/finance/receivables`** — Account Receivables ageing (`receivables-controls.tsx`): write-off / restore milestone. Actions → `finance/receivables/actions.ts`.
- **`/billing`** — subscription/billing (`billing/page.tsx`), plan limits/usage (read).

### HR (`lib/nav.ts:157-169`)
- **`/hr/attendance`** — my attendance (`attendance-view.tsx`): apply leave/WFH. Actions → `hr/attendance/actions.ts`.
- **`/hr/attendance/admin`** — Approvals queue (`admin-view.tsx`): decide leave/WFH/etc. Guard `hr.leave.approve`.

### ADMIN (`lib/nav.ts:171-185`)
- **`/settings`** — config hub (`settings/page.tsx`): 5 live cards (Numbering, Users, Roles & permissions, Workspace & people, Quotations) + 3 "soon" (Branches & teams, Company profile, Field visibility, `:67-86`).
- **`/settings/numbering`** — doc numbering series editor → `upsertNumberingSeriesAction`.
- **`/settings/users`** — users + reporting line (`users-view.tsx`): set manager, set member status. Actions → `settings/users/actions.ts`.
- **`/settings/roles`** — role matrix (`role-editor.tsx`, `permission-matrix.tsx`): set capability, set group, create/update/delete role, set permission. Actions → `settings/roles/actions.ts` + `settings/actions.ts`.
- **`/settings/workspace`** — workspace options + lead statuses (`settings/workspace/`): upsert/retire option, upsert/retire lead status.
- **`/settings/quotations`** — quotation defaults + T&C + AI prompt library (`quotation-settings-view.tsx`): save settings, save/delete terms. Actions → `settings/quotations/actions.ts`.
- **`/approvals`** — approval requests + **`/approvals/rules`** thresholds (`rules-table.tsx`): create/approve/reject request, upsert rule. Actions → `approvals/actions.ts`.
- **`/reports`** — report index (`reports/page.tsx`): 9 report cards, each gated by capability, rendered only if held. **`/reports/[report]`** runs one (`reports-config.tsx:93-403`): sales-funnel, receivables-ageing, vendor-performance, stock-summary, gst-summary, project-profitability(cash flow), client-summary, user-activity, labour-summary. CSV export button.

### OUTSIDE (app) shell
- **`/`** (`app/page.tsx`) redirect; **`/q/[token]`** public share view of a quotation (no auth, `app/q/[token]/page.tsx`); **`/login`** session picker (`app/(auth)/login/`).

---

## PART 2 — SERVER-ACTION / API SURFACE (by area, with capability guard)

No route handlers exist (`app/**/route.ts` → none). All mutations are `"use server"` actions. `requireCan(x)` returns a denial object; `can(x)` guards with a bare return; **ungated** = deliberate self-service (`§5a`).

**Shell / auth**
- `setActingMemberAction` — view-as (`app/(app)/actions.ts:23`), ungated (dev/impersonation).
- `startSessionAction`, `endSessionAction` (`(auth)/login/actions.ts`); `signUp`,`signIn`,`signOut` (`(auth)/actions.ts`) — auth, ungated.

**Sales**
- Leads (`leads/actions.ts`): `createLeadAction`→`leads.lead.create`; `updateLeadAction`,`setAssigneesAction`,`addRemarkAction`,`createFollowUpAction`,`completeFollowUpAction`,`rescheduleFollowUpAction`,`logCallAction`→`leads.lead.edit`; `setStatusAction`,`cancelFollowUpAction`→`leads.lead.edit`(can); `promoteToProjectAction`→`projects.project.create`; `upsertLeadStatusAction`,`retireLeadStatusAction`→`settings.workspace.edit`.
- Pipeline (`pipeline/actions.ts`): `createFollowUpAction`,`completeFollowUpAction`→`leads.lead.edit`.
- Communication (`communication/actions.ts`): `logInteractionAction`→`leads.lead.edit`.
- Quotations (`quotations/actions.ts`): `createQuotationAction`,`updateMetaAction`,`addSectionAction`,`renameSectionAction`,`deleteSectionAction`,`addLineAction`,`updateLineAction`,`deleteLineAction`,`newVersionAction`,`setShareAction`,`saveAsTemplateAction`,`newQuotationFromTemplateAction`→`quotations.quotation.create`; `setStatusAction`→`quotations.quotation.approve`; `deleteTemplateAction`→`quotations.quotation.delete`; `raiseMaterialRequestAction`→`procurement.mr.create`; `searchItemsAction`→`items.item.view`.

**Execution**
- Projects (`projects/actions.ts`): `createProjectAction`→`projects.project.create`; `updateProjectStageAction`,`addProjectNoteAction`→`projects.project.edit`.
- Plan (`projects/[id]/plan/actions.ts`): `addMilestoneAction`,`updateMilestoneAction`,`applyTemplatesAction`,`addScopeAction`,`toggleDependencyAction`,`addProjectTaskAction`,`setProjectTaskStatusAction`→`projects.project.edit`; `deleteMilestoneAction`→`projects.project.edit`(can); `deleteProjectTaskAction`→`projects.task.delete`.
- Site company (`site/actions.ts`): `addSiteLogAction`,`addPhotoAction`,`addVarianceAction`→`projects.project.edit`; `checkInAction`,`checkOutAction`→ungated.
- Site project (`projects/[id]/site/actions.ts`): `addProgressAction`,`updatePhotoAction`,`setVisibilityAction`,`deletePhotosAction`,`setPhotoCommentStatusAction`→`projects.project.edit`; `deletePhotoAction`→can edit; `addPhotoCommentAction`→`projects.project.view`.
- Documents (`projects/[id]/documents/actions.ts`): folder/file create/rename/upload/update→`projects.project.edit`; delete folder/file→can edit; `addFileCommentAction`→`projects.project.view`; `setCommentStatusAction`→edit.
- Labour (`projects/[id]/labour/actions.ts`): `addAttendanceAction`,`updateEntryAction`,`setLabourVisibilityAction`→`projects.project.edit`; `deleteEntryAction`→can edit.
- Production (`production/actions.ts`): `createBomAction`,`createCutlistAction`→`projects.project.edit`.
- Design (`design/actions.ts`): `createAssetAction`,`signOffAction`→`projects.project.edit`; `addCommentAction`→`projects.project.view`. Prompts (`design/prompts/actions.ts`): `createDesignPromptAction`,`retireDesignPromptAction`→`projects.project.edit`.

**Operations**
- Procurement company (`procurement/actions.ts`): `createMaterialRequestAction`,`addMRItemAction`→`procurement.mr.create`; `updateMRStageAction`→`procurement.mr.approve`(can); `removeMRItemAction`→mr.create(can); `searchItemsAction`→`items.item.view`.
- Procurement project (`projects/[id]/procurement/actions.ts`): `createRequestAction`→`procurement.mr.create`; `setStageAction`→`procurement.mr.approve`; `deleteRequestAction`→`procurement.mr.delete`.
- RFQ (`rfq/actions.ts`): `createRfqAction`,`createRfqFromMrAction`,`enterBidAction`→`procurement.rfq.create`; `awardRfqAction`→`procurement.po.approve`.
- Orders (`orders/actions.ts`): `createPurchaseOrderAction`,`recordReceiptAction`→`procurement.po.create`; `updateOrderStateAction`,`updatePaymentStateAction`→`procurement.po.approve`.
- Inventory (`inventory/actions.ts`): `createWarehouseAction`→`inventory.warehouse.create`; `deactivate`/`reactivateWarehouseAction`→warehouse.create(can); `addStockInAction`→`inventory.movement.create`; `searchItemsAction`→`items.item.view`.
- Vendors (`vendors/actions.ts`): `createVendorAction`,`updateVendorAction`,`addRateContractAction`→`vendors.vendor.create`; `setVendorStatusAction`→vendor.create(can); `deactivateVendorAction`→`vendors.vendor.delete`.
- Items (`items/actions.ts`): `createItemAction`,`updateItemAction`,`importItemsCsvAction`→`items.item.create`; `toggleActiveAction`→item.create(can).
- Approvals (`approvals/actions.ts`): `createRequestAction`→`procurement.mr.create`; `approveRequestAction`,`rejectRequestAction`→`procurement.mr.approve`; `upsertRuleAction`→`settings.workspace.edit`.

**Accounting**
- Finance (`finance/actions.ts`): `createContractAction`,`toggleMilestoneAction`,`recordPaymentAction`→`billing.payment.create`; `saveViewAction`,`deleteViewAction`,`meterExportAction`→`billing.payment.view`.
- Project finance (`projects/[id]/finance/actions.ts`): `addContractAction`,`updateContractAction`,`saveScheduleAction`,`recordPaymentAction`→`billing.payment.create`; `deleteContractAction`→can create.
- Project payments (`projects/[id]/payments/actions.ts`): `addEntryAction`→`billing.payment.create`; `reverseEntryAction`→`billing.payment.approve`.
- Petty (`finance/petty/actions.ts`): `recordPettyEntryAction`→ungated self-service (`:32-36`); `reversePettyEntryAction`,`decidePettyClaimAction`→`billing.payment.approve`.
- Receivables (`finance/receivables/actions.ts`): `writeOffMilestoneAction`,`restoreMilestoneAction`→`billing.payment.approve`.

**HR / Dashboard**
- HR (`hr/attendance/actions.ts`): `applyLeaveAction`→ungated (self); `decideRequestAction`→`hr.leave.approve`.
- Dashboard (`dashboard/actions.ts`): `checkInAction`,`checkOutAction`,`requestLeaveAction`,`cancelLeaveAction`,`submitExpenseAction`,`startVisitAction`,`endVisitAction`→ungated self-service; `createTaskAction`,`updateTaskAction`,`setTaskStatusAction`,`toggleChecklistAction`→`projects.project.edit`; `deleteTaskAction`→`projects.task.delete`; `decideLeaveAction`→`hr.leave.approve`; `decideExpenseAction`→`billing.payment.approve`; `upsertOptionAction`,`retireOptionAction`→`settings.workspace.edit`; `updateMemberAction`→`settings.user.edit`.

**Admin**
- Settings (`settings/actions.ts`): `upsertNumberingSeriesAction`→`settings.workspace.edit`; `setPermissionAction`,`removePermissionAction`→`settings.role.edit`.
- Roles (`settings/roles/actions.ts`): `setCapabilityAction`,`setGroupAction`,`createRoleAction`,`updateRoleAction`,`deleteRoleAction`→`settings.role.edit`.
- Users (`settings/users/actions.ts`): `setManagerAction`,`setMemberStatusAction`→`settings.user.edit`.
- Quotation settings (`settings/quotations/actions.ts`): `saveQuotationSettingsAction`,`saveTermsAction`→`settings.workspace.edit`; `deleteTermsAction`→can edit.

---

## PART 3 — DB SCHEMA (tenant tables + key columns)

Registered tenant tables: `lib/data/tables.ts:11-130` (each carries `org_id`). Platform tables (not org-scoped): `orgs`, `app_users`, `plans` (`tables.ts:138`). Every table has `id uuid`, `org_id uuid`, `created_at`. Only distinguishing columns listed. **⚠ = append-only ledger / never-mutated-in-place.**

**Tenancy / people**
- `branches` — name, code, is_default.
- `org_members` — user_id, role(tier), role_id(FK roles), manager_id, status, display_name, designation.
- `roles` — name, is_system, permissions(jsonb `{all:true}`=owner), inherits_from, description.
- `permissions` — role_id, module, entity, action, scope (the grant rows).
- `parties` — name, phone, roles(ARRAY) (unified customer/vendor party).
- ⚠ `audit_events` — actor_member_id, entity, entity_id, action, before/after(jsonb), at.

**Sales**
- `leads` — name, phone, email, source, status, value, assigned_to, project_type/budget_band/scope/rooms(ARRAY)/theme/layout_sqft, sales_owner_id, latest_remark, rating, address, project_id(FK), external_ref.
- `lead_activities` — kind, note, meta(jsonb). `lead_assignees` — member_id. `lead_statuses` — value,label,seq,tone,is_won,is_lost,is_system (config). `pipeline_stages` — **DEAD** (`tables.ts:34-37`).
- `follow_ups` — lead_id, due_at, done, kind, title, priority, status, outcome, member_id, rescheduled_from. `follow_up_assignees`. `followup_outcome_rules` — outcome_slug→next_status, auto_schedule_days (config).
- ⚠ `interactions` — channel, direction, status, duration_sec, disposition, recording_url, occurred_at.

**Quotations** (detail in VEYRA-BUILD-MAP.md)
- `quotations` — number, version_group/version, status, customer snapshot, place_of_supply/seller_state/gst_treatment/works_contract, money snapshots (subtotal…grand_total, cgst/sgst/igst_total, cost_total, margin_total), source, doc_type, project_id, ref_no, share_token/share_enabled. (recomputed, not hand-entered)
- `quotation_sections` — title, sort_order. `quotation_lines` — flat: item_id, title/area/category/desc/hsn_sac, qty/uom/unit_price, discount_*, tax_rate, cost_rate, money snapshots, measure_* (6), scope_item_id. 
- `quotation_templates` / `_sections` / `_lines` — preset inputs (no money). `quotation_terms` — T&C library. `quotation_settings` — default_gst_pct/margin_pct/validity_days, footer_note, show_cost_column.
- `ai_prompt_templates` — name, prompt, kind. ⚠ `ai_requests` — provider, model, prompt, status, lines_created, ref_id (append-only AI log).

**Spine**
- `scope_items` — project_id, quotation_id, parent_id(self-FK), code(`QS:`/`QL:` origin), name, room, uom, qty, sort_order. Referenced via nullable `scope_item_id` on quotation_lines, material_request_items, rfq_items, po_lines, bom_lines, cutlist_panels.

**Items / inventory**
- `items` — name, name_key(dedupe), code, type(material/service/labour/machine/module), base_uom/purchase_uom/factor, base_rate, hsn_sac, tax_rate, is_active.
- `warehouses` — name, project_label, project_id, kind, parent_id(bin nesting), is_active.
- ⚠ `stock_movements` — item_id, warehouse_id, direction(in/out), qty, uom, unit_rate, gst_pct, source_doc, grn_id (append-only; stock levels are SUMmed from this, never stored — `inventory-view.tsx:905`).
- `grns` — po_id, warehouse_id, grn_no, status, direction, vendor_id, reference (stock-note document header).

**Vendors / procurement**
- `vendors` — name, contact, phone, gstin, category, payment_terms, lead_time_days, rating, working_model, status, is_active. `vendor_categories` (rows), `vendor_rate_contracts` — item, rate, moq, lead_time, valid_from/to.
- `material_requests` — title, project_id, project_label, expected_delivery, stage, source, request_type, number. `material_request_items` — item_id/item_name, is_adhoc, uom, qty, scope_item_id, **stage** (per-line), stage_changed_at.
- `rfqs` — mr_id, title, place_of_supply, bid_deadline, status, awarded_vendor_id/award_reason/awarded_by/awarded_at. `rfq_vendors` (invited), `rfq_items`, `rfq_bids` (version, entry_mode), `rfq_bid_lines` (unit_rate, tax, freight, line_total).
- `purchase_orders` — name, vendor_id, rfq_id, type(purchase/work), amount, order_state, payment_state, order/delivery_date, project_id. `po_lines` — item, uom, qty, unit_rate, tax_pct, line_total, scope_item_id. ⚠ `po_receipts` / `po_receipt_lines` — qty_received (receipt event).

**Projects / execution**
- `projects` — name, client_name, lead_id, stage, health, project_value, funds_received, total_payable, start/handover_date, physical_progress_pct.
- `project_updates` — kind, note (activity feed). `project_milestones` — scope_item_id, name, status, progress_pct, planned/actual start/end, assignee_id, client_visible, last_update, sort_order (delivery schedule). `project_milestone_deps` — milestone_id→depends_on_id (graph). `milestone_templates` — scope_group, name, offset/duration_days (config). `tasks` + `task_checklist`.
- `project_folders`, `project_files` (folder_id, internal_status, client_approval, current_version, contract/payment/labour_entry_id links), `project_file_versions` (⚠ version chain: version_no, storage_path, size, mime).
- Site: `site_logs` (log_date, work_summary), `site_photos` (url, storage_path, client_visible, taken_on), `site_attendance` (check_in/out, lat/lng), `measurement_variance` (quoted_qty vs measured_qty).
- Labour: `labour_entries` (entry_date, contract_id, skilled/unskilled/coordinator counts, client_visible — no `total` column by design), `labour_entry_categories`, `labour_entry_vendors` (rows).
- Design: `assets` (kind, url), `asset_comments` (x_pct/y_pct pin), `asset_signoffs` (status, signed_by).

**Production**
- `boms` (title, source_ref, status), `bom_lines` (material_name, qty, waste_pct, effective_qty, scope_item_id). `cutlists` (board material/size), `cutlist_panels` (length/width_mm, qty, grain, edge_l1..w2, scope_item_id). ⚠ `nesting_runs` (board size, kerf, boards_used, waste_pct), `nesting_placements` (x/y/w/h_mm, rotated). `panel_tags` (token, stage), ⚠ `panel_events` (stage timeline). `work_centers` (kind, capacity_per_day).

**Finance / money**
- `contracts` — name, amount, source, project_id, vendor_id (client/vendor contracts). `milestones` — contract_id, seq, name, pct, amount, tentative_due, work_done, actual_due, written_off_at/reason/by (billing schedule; distinct from project_milestones — `tables.ts:94`).
- ⚠ `payments` — contract_id, milestone_id, direction, amount, mode, paid_on, project_id, vendor_id, member_id, expense_type/category, **reversal_of** (ledger; reversed by counter-entry, not deleted), stock_in_requested/grn_id.
- ⚠ `expense_claims` — member_id, project_id, spent_on, amount, category, receipt_url, status, kind, **reversal_of**, vendor_id (petty ledger).
- Subscriptions: `subscriptions` (plan_code, status, trial_ends_at), ⚠ `usage_events` (metric, quantity, ref — append-only meter; quota derived, never a counter — `subscription-model.ts:6`).

**HR / config**
- ⚠ `work_sessions` (check_in/out, lat/lng, source — attendance ledger). `leave_requests` (leave_type, from/to, days, status, decided_by). `wfh_requests` (sibling of leave — `tables.ts:120-123`). `holidays` (tenant calendar). `field_visits` (purpose, project_id/lead_id, started/ended_at, geo).
- `numbering_series` — doc_type, prefix, fy_segment, padding, current_int. `workspace_options` — kind, value, label, seq, tone (all app dropdowns). `saved_views` — member_id, screen, name, query (stores the QUESTION not answer — `tables.ts:126-129`).
- `approval_rules` (module, threshold_amount, approver_role), `approval_requests` (module, entity_id, amount, status, decided_by).
- `entity_comments` — one comment thread shared by files/site-photos/orders (entity_type, entity_id, parent_id, audience, status, page, x/y pin). `contract_categories`.

---

## PART 4 — BUILT vs NOT

**Feature flag (built but hidden)**
- `TEAM_VIEW_ENABLED = false` (`dashboard/workspace-shell.tsx:73`) — the manager/owner "Team" dashboard (Overview/Team/Task board/Approvals/Setup panels) is fully built, data layer + approval actions work, but PARKED at owner request; every role sees only the My-work view (`dashboard/page.tsx:40`).

**Nav leaves shown disabled with a "soon" chip (no route, no spec)** — `nav.ts:51` (`soon?`):
- `/projects/insights` (Project Insights), `/projects/mb-sheets` (MB Sheets), `/projects/renders` (2D→3D Renders) — `nav.ts:95-104`. Sidenav renders these disabled with a "coming soon" title (`components/shell/sidenav.tsx:262-269`).

**Project workspace "Coming next" cards (placeholders, awaiting spec)** — `project-workspace.tsx:581-584`: MB sheet, 2D→3D renders.

**Settings hub "Soon" cards (no route)** — `settings/page.tsx:67-86`: Branches & teams, Company profile, Field visibility (per-role cost-column hiding — only partially realized via `billing.cost.view` + project Hide-money toggle).

**Dead / legacy (present but do not build on)**
- `pipeline_stages` table — DEAD as of PLAN-V4 6.1; board reads `lead_statuses` instead (`tables.ts:34-37`). `/pipeline` Kanban itself is slated for replacement by a funnel (`nav.ts:78-81`) but is still live.

**Deliberately minimal / v1 limitations (not stubs, but incomplete)**
- Site & design photos are **pasted URLs — no file upload pipeline** in v1 (`site/page.tsx:34,190`); project *documents* do have real storage (`project_file_versions.storage_path`).
- Inventory "Goods Value" is ledger arithmetic, **not FIFO/weighted-average** valuation — "finance decisions nobody has made yet" (`inventory-view.tsx:269-274`).
- Company-wide procurement Inventory sub-tab is intentionally absent in company scope (project scope only) (`procurement-view.tsx:340-345`).
- `quotation.doc_type='modular'` is captured & stored but **no code branches on it** — the builder is identical for every type (see VEYRA-BUILD-MAP.md Q-F).
- `team.ts:346` TODO — coarse tier check to be replaced by `can()` in a later unit.

**Consistency note**
- No `app/**/route.ts` handlers at all — the app is 100% server-actions + server components; the only unauthenticated surface is `/q/[token]` (public quote via `getSharedQuotation`, `lib/data/quotations.ts:758`).
