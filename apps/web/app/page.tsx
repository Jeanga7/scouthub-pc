import { AppShell } from "@scouthub/ui";
import Link from "next/link";
import { isLocalIdentityMode } from "@/identity/local-mode";

export default function PublicHomePage() {
  return (
    <AppShell>
      <main className="page">
        <header className="public-header"><Link className="brand" href="/">ScoutHub-PC</Link><span>Pilote Petite Côte</span></header>
        <section className="hero landing-hero">
          <div>
            <p className="eyebrow">Projects & Impact</p>
            <h1>Le pilotage régional, au service de l’action scoute.</h1>
            <p className="lead">ScoutHub-PC est la plateforme numérique de pilotage du scoutisme régional : des projets mieux suivis, des validations plus fluides et une mémoire institutionnelle durable.</p>
            <a className="button-link hero-cta" href={isLocalIdentityMode(process.env) ? "/local-demo" : "/sign-in"}>Accéder à ScoutHub</a>
          </div>
          <div className="hero-emblem" aria-hidden="true"><span>⚜</span><strong>Petite Côte</strong><small>Agir · Servir · Transmettre</small></div>
        </section>
        <section className="feature-grid" aria-label="Fonctionnalités">
          <article><span>01</span><h2>Organisations</h2><p>Une vision claire des régions, districts, groupes et unités.</p></article>
          <article><span>02</span><h2>Projets</h2><p>Des initiatives structurées, de l’idée à la mise en œuvre.</p></article>
          <article><span>03</span><h2>Validation</h2><p>Un dialogue régional traçable pour accompagner la qualité.</p></article>
          <article><span>04</span><h2>Preuves & suivi</h2><p>Des éléments fiables pour documenter l’action et son impact.</p></article>
        </section>
      </main>
    </AppShell>
  );
}
