import type { ReactNode } from "react";
import type { ComponentPropsWithoutRef } from "react";
export { scoutHubDesignTokens } from "./tokens";
export type { ScoutHubDesignTokens } from "./tokens";

type ButtonProps = ComponentPropsWithoutRef<"button">;

export function Button({ className = "", ...props }: ButtonProps) {
  return <button className={`sh-button ${className}`} {...props} />;
}

export function IconButton({ label, className = "", ...props }: ButtonProps & { readonly label: string }) {
  return <button aria-label={label} className={`sh-icon-button ${className}`} {...props} />;
}

export function Card({ className = "", ...props }: ComponentPropsWithoutRef<"article">) {
  return <article className={`sh-card ${className}`} {...props} />;
}

export function StatusBadge({ status }: { readonly status: string }) {
  return <span className="sh-status-badge">{status.replaceAll("_", " ")}</span>;
}

export function Avatar({ name }: { readonly name: string }) {
  return <span aria-label={name} className="sh-avatar">{name.slice(0, 1).toUpperCase()}</span>;
}

export function Breadcrumb({ items }: { readonly items: readonly { label: string; href?: string }[] }) {
  return <nav aria-label="Fil d’Ariane" className="sh-breadcrumb">{items.map((item, index) => (
    <span key={`${item.label}-${index}`}>{item.href ? <a href={item.href}>{item.label}</a> : item.label}</span>
  ))}</nav>;
}

export function PageHeader({ eyebrow, title, description, actions }: { readonly eyebrow?: string; readonly title: string; readonly description?: string; readonly actions?: ReactNode }) {
  return <header className="sh-page-header">{eyebrow ? <p className="eyebrow">{eyebrow}</p> : null}<div><h1>{title}</h1>{description ? <p>{description}</p> : null}</div>{actions ? <div className="sh-page-actions">{actions}</div> : null}</header>;
}

export function Sidebar({ children }: { readonly children: ReactNode }) {
  return <aside className="sh-sidebar" aria-label="Navigation principale">{children}</aside>;
}

export function BottomNav({ children }: { readonly children: ReactNode }) {
  return <nav className="sh-bottom-nav" aria-label="Navigation mobile">{children}</nav>;
}

export function Sheet({ title, children, onClose }: { readonly title: string; readonly children: ReactNode; readonly onClose: () => void }) {
  return <div className="sh-sheet-backdrop" role="presentation" onClick={onClose}><section className="sh-sheet" role="dialog" aria-modal="true" aria-label={title} onClick={(event) => event.stopPropagation()}><header><h2>{title}</h2><IconButton label="Fermer" type="button" onClick={onClose}>×</IconButton></header>{children}</section></div>;
}

export function EmptyState({ title, description }: { readonly title: string; readonly description: string }) {
  return <div className="sh-empty-state"><h2>{title}</h2><p>{description}</p></div>;
}

export function OrganizationCard({ name, type, status, href, detail }: { readonly name: string; readonly type: string; readonly status: string; readonly href: string; readonly detail?: string }) {
  return <a className="sh-organization-card" href={href}><div><StatusBadge status={type} /><StatusBadge status={status} /></div><strong>{name}</strong>{detail ? <span>{detail}</span> : null}<span className="sh-card-arrow" aria-hidden="true">→</span></a>;
}

export function AppShell({ children }: { readonly children: ReactNode }) {
  return <div className="shell">{children}</div>;
}
