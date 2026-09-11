import Link from "next/link";
import React from "react";

export default function PublicHomePage() {
  return (
    <main>
      <section className="public-hero" aria-labelledby="public-hero-title">
        <div className="public-hero-inner">
          <div className="public-hero-copy">
            <p className="eyebrow">ScoutHub · Région Petite Côte</p>
            <h1 id="public-hero-title">Faire grandir l’action scoute.</h1>
            <p className="public-hero-lead">
              Une plateforme régionale pour mieux accompagner les projets,
              valoriser l’impact et transmettre la mémoire de nos équipes.
            </p>
            <div className="public-hero-actions">
              <Link className="public-primary-action" href="#actions">
                Découvrir nos actions <span aria-hidden="true">→</span>
              </Link>
              <span className="public-hero-note">
                Agir · Servir · Transmettre
              </span>
            </div>
          </div>
          <div
            className="public-hero-visual"
            aria-label="Emblème de ScoutHub-PC"
          >
            <div className="public-visual-ring">
              <span>⚜</span>
            </div>
            <div className="public-visual-caption">
              <strong>Petite Côte</strong>
              <span>Une même direction, des initiatives qui comptent.</span>
            </div>
          </div>
        </div>
        <div className="public-hero-baseline" aria-hidden="true">
          <span>01</span>
          <span>Territoire · Engagement · Impact</span>
        </div>
      </section>

      <section
        className="public-mission"
        id="mission"
        aria-labelledby="mission-title"
      >
        <div>
          <p className="eyebrow">Notre mission</p>
          <h2 id="mission-title">Le numérique au service du terrain.</h2>
        </div>
        <p>
          ScoutHub-PC relie les responsables, les groupes et la région autour
          d’informations fiables et d’actions concrètes, dans le respect de
          l’identité scoute et de la protection des personnes.
        </p>
      </section>

      <section
        className="public-actions"
        id="actions"
        aria-labelledby="actions-title"
      >
        <div className="public-section-heading">
          <div>
            <p className="eyebrow">Domaines d’action</p>
            <h2 id="actions-title">Une région en mouvement.</h2>
          </div>
          <span className="public-section-index">02 / 03</span>
        </div>
        <div className="public-action-grid">
          <article>
            <span className="public-action-number">01</span>
            <h3>Projets & impact</h3>
            <p>
              Structurer les initiatives et rendre visible leur contribution.
            </p>
          </article>
          <article>
            <span className="public-action-number">02</span>
            <h3>Vie des groupes</h3>
            <p>Relier les équipes et soutenir chaque niveau du territoire.</p>
          </article>
          <article>
            <span className="public-action-number">03</span>
            <h3>Mémoire régionale</h3>
            <p>
              Conserver les repères qui permettent aux générations de
              transmettre.
            </p>
          </article>
        </div>
      </section>
    </main>
  );
}
