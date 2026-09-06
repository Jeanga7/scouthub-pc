INSERT INTO "permission_definition" ("code", "description") VALUES
 ('position.read', 'Read the position catalogue.'), ('position.manage', 'Manage the position catalogue.'),
 ('appointment.read', 'Read scoped appointments.'), ('appointment.create', 'Propose scoped appointments.'),
 ('appointment.validate', 'Approve or reject scoped appointments.'), ('appointment.end', 'End scoped appointments.')
ON CONFLICT ("code") DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id") SELECT rd.id, pd.id FROM "role_definition" rd JOIN "permission_definition" pd ON pd.code IN ('position.read','position.manage','appointment.read','appointment.create','appointment.validate','appointment.end') WHERE rd.code = 'REGIONAL_ADMIN' ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id") SELECT rd.id, pd.id FROM "role_definition" rd JOIN "permission_definition" pd ON pd.code IN ('position.read','appointment.read','appointment.create','appointment.end') WHERE rd.code IN ('GROUP_ADMIN','UNIT_LEADER') ON CONFLICT DO NOTHING;
--> statement-breakpoint
INSERT INTO "role_permission" ("role_id", "permission_id") SELECT rd.id, pd.id FROM "role_definition" rd JOIN "permission_definition" pd ON pd.code IN ('position.read','appointment.read','appointment.validate') WHERE rd.code IN ('DISTRICT_REVIEWER','REGIONAL_PROGRAMME_REVIEWER') ON CONFLICT DO NOTHING;
