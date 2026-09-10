import type {
  MemberAggregateView,
  MemberDetailView,
  MemberListPage,
  MemberSummaryView,
} from "@scouthub/application";
import {
  memberAggregateSchema,
  memberDetailSchema,
  memberListResponseSchema,
  memberSummarySchema,
  membershipResponseSchema,
} from "@scouthub/contracts";
import type { Membership } from "@scouthub/domain";

export function mapMemberSummary(value: MemberSummaryView) {
  return memberSummarySchema.parse(value);
}

export function mapMemberList(
  value: MemberListPage,
  page: number,
  pageSize: number,
) {
  return memberListResponseSchema.parse({
    items: value.items.map(mapMemberSummary),
    page,
    pageSize,
    total: value.total,
  });
}

export function mapMembership(value: Membership) {
  return membershipResponseSchema.parse({
    ...value,
    startsAt: value.startsAt.toISOString(),
    endsAt: value.endsAt?.toISOString() ?? null,
    createdAt: value.createdAt.toISOString(),
    updatedAt: value.updatedAt.toISOString(),
  });
}

export function mapMemberDetail(value: MemberDetailView) {
  return memberDetailSchema.parse({
    ...value,
    birthDate: value.birthDate?.toISOString() ?? null,
    joinedScoutingAt: value.joinedScoutingAt?.toISOString() ?? null,
    memberships: value.memberships.map(mapMembership),
    activeAppointments: value.activeAppointments.map((item) => ({
      id: item.id,
      title: item.title,
      scopeName: item.scopeName,
      startsAt: item.startsAt.toISOString(),
      endsAt: item.endsAt?.toISOString() ?? null,
    })),
  });
}

export function mapMemberAggregate(value: MemberAggregateView) {
  return memberAggregateSchema.parse(value);
}
