export const localDemoPersonas = [
  {
    selectorId: "70000000-0000-4000-8000-000000000001",
    subjectId: "local_demo_regional_admin",
    label: "Administratrice régionale",
    description: "Organisations, accès et vision régionale"
  },
  {
    selectorId: "70000000-0000-4000-8000-000000000002",
    subjectId: "local_demo_project_owner",
    label: "Responsable de groupe",
    description: "Création de projets, preuves et soumission"
  },
  {
    selectorId: "70000000-0000-4000-8000-000000000003",
    subjectId: "local_demo_reviewer",
    label: "Reviewer régional",
    description: "File de validation, commentaires et décisions"
  }
] as const;

export function isLocalPersonaSelector(value: string): boolean {
  return localDemoPersonas.some((persona) => persona.selectorId === value);
}
