import type { SVGProps } from "react";

/**
 * Two people plus a circled plus. Lucide has Users / UsersRound and
 * UserPlus, but not a duo-plus mark, so this follows the lucide stroke
 * style for the Create group control.
 */
export function UsersPlusIcon({
  className,
  ...props
}: SVGProps<SVGSVGElement>) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className={className}
      {...props}
    >
      <path d="M14.6 20.25v-1.1a3.6 3.6 0 0 0-3.6-3.6H6.1a3.6 3.6 0 0 0-3.6 3.6v1.1" />
      <circle cx="8.55" cy="7.15" r="3.15" />
      <path d="M15.7 4.2a3 3 0 0 1 0 5.7" />
      <path d="M17.15 12.85a3.7 3.7 0 0 1 3.35 2.15" />
      <circle
        cx="17.7"
        cy="17.7"
        r="3.85"
        className="fill-background stroke-current group-hover/button:fill-muted"
      />
      <path d="M17.7 15.85v3.7" />
      <path d="M15.85 17.7h3.7" />
    </svg>
  );
}
