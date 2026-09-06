import {
  AppointmentUseCases,
  GovernancePersonDirectoryUseCases,
  PositionUseCases,
} from "@scouthub/application";
import {
  createPgAppointmentRepository,
  createPgGovernancePersonDirectoryRepository,
  createPgPositionRepository,
} from "@scouthub/infrastructure";
import { getServerEnv } from "@/env/server";

export function createPositionUseCases() {
  return new PositionUseCases(
    createPgPositionRepository(getServerEnv().DATABASE_URL),
  );
}
export function createAppointmentUseCases() {
  return new AppointmentUseCases(
    createPgAppointmentRepository(getServerEnv().DATABASE_URL),
  );
}
export function createGovernancePersonDirectoryUseCases() {
  return new GovernancePersonDirectoryUseCases(
    createPgGovernancePersonDirectoryRepository(getServerEnv().DATABASE_URL),
  );
}
