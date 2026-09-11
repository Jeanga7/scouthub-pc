"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@scouthub/ui";
import type { OrganizationResponse } from "@scouthub/contracts";

export function MemberCreateForm({
  tenantId,
  organizations,
}: {
  readonly tenantId: string;
  readonly organizations: OrganizationResponse[];
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const data = new FormData(event.currentTarget);
    const birthDate = formValue(data, "birthDate");
    const startsAt = formValue(data, "startsAt");
    const joinedScoutingAt = formValue(data, "joinedScoutingAt");
    const insuranceYear = formValue(data, "insuranceYear");
    const response = await fetch("/api/v1/members", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        tenantId,
        firstName: data.get("firstName"),
        lastName: data.get("lastName"),
        birthDate: birthDate ? new Date(birthDate).toISOString() : null,
        birthPlace: data.get("birthPlace") || null,
        sex: data.get("sex"),
        primaryPhone: data.get("primaryPhone") || null,
        secondaryPhone: data.get("secondaryPhone") || null,
        email: data.get("email") || null,
        guardianName: data.get("guardianName") || null,
        guardianPhone: data.get("guardianPhone") || null,
        guardianRelationship: data.get("guardianRelationship") || null,
        organizationId: data.get("organizationId"),
        startsAt: new Date(startsAt).toISOString(),
        branch: data.get("branch") || null,
        insuranceNumber: data.get("insuranceNumber") || null,
        insuranceYear: insuranceYear ? Number(insuranceYear) : null,
        joinedScoutingAt: joinedScoutingAt
          ? new Date(joinedScoutingAt).toISOString()
          : null,
        administrativeNotes: data.get("administrativeNotes") || null,
      }),
    });
    const body = (await response.json()) as {
      data?: { personId: string };
      detail?: string;
    };
    if (!response.ok || !body.data) {
      setError(body.detail ?? "Création impossible.");
      setLoading(false);
      return;
    }
    router.push(`/app/members/${body.data.personId}` as never);
  }
  return (
    <form className="member-form" onSubmit={(event) => void submit(event)}>
      {error ? (
        <p className="form-error" role="alert">
          {error}
        </p>
      ) : null}
      <fieldset>
        <legend>Identité</legend>
        <label>
          Nom
          <input name="lastName" required autoComplete="family-name" />
        </label>
        <label>
          Prénoms
          <input name="firstName" required autoComplete="given-name" />
        </label>
        <label>
          Date de naissance
          <input name="birthDate" type="date" />
        </label>
        <label>
          Lieu de naissance
          <input name="birthPlace" />
        </label>
        <label>
          Sexe
          <select name="sex" required>
            <option value="UNSPECIFIED">Non renseigné</option>
            <option value="FEMALE">Féminin</option>
            <option value="MALE">Masculin</option>
          </select>
        </label>
      </fieldset>
      <fieldset>
        <legend>Contact</legend>
        <label>
          Téléphone
          <input name="primaryPhone" inputMode="tel" />
        </label>
        <label>
          Téléphone secondaire
          <input name="secondaryPhone" inputMode="tel" />
        </label>
        <label>
          Email
          <input name="email" type="email" />
        </label>
        <label>
          Responsable légal
          <input name="guardianName" />
        </label>
        <label>
          Téléphone responsable légal
          <input name="guardianPhone" inputMode="tel" />
        </label>
        <label>
          Lien avec le membre
          <input name="guardianRelationship" />
        </label>
      </fieldset>
      <fieldset>
        <legend>Scoutisme</legend>
        <label>
          Structure
          <select name="organizationId" required>
            {organizations.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} ({item.type})
              </option>
            ))}
          </select>
        </label>
        <label>
          Branche
          <select name="branch">
            <option value="">Dériver si unité</option>
            <option>Jaune</option>
            <option>Verte</option>
            <option>Rouge</option>
          </select>
        </label>
        <label>
          Date de rattachement
          <input name="startsAt" type="date" required />
        </label>
        <label>
          Date d&apos;entrée scoutisme
          <input name="joinedScoutingAt" type="date" />
        </label>
        <label>
          Numéro assurance
          <input name="insuranceNumber" />
        </label>
        <label>
          Année assurance
          <input name="insuranceYear" type="number" min="2000" max="2100" />
        </label>
      </fieldset>
      <fieldset>
        <legend>Confirmation</legend>
        <label>
          Notes administratives
          <textarea name="administrativeNotes" maxLength={1000} />
        </label>
        <p className="muted">
          Le Scout ID sera généré par le serveur. Aucun compte ScoutHub
          n&apos;est requis.
        </p>
      </fieldset>
      <Button type="submit" disabled={loading}>
        {loading ? "Création..." : "Créer le membre"}
      </Button>
    </form>
  );
}

function formValue(data: FormData, key: string): string {
  const value = data.get(key);
  return typeof value === "string" ? value : "";
}
