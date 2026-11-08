import Image from "next/image";
import mark from "@/assets/empiriolabs-ai-mark.png";

type SignInLinkProps = {
  href: string;
  className: string;
  /** Runs before the browser leaves for the consent screen. */
  onClick?: () => void;
  markSize?: number;
};

/**
 * Starts Sign in with EmpirioLabs AI. A plain link, not a Next.js Link, so it
 * is never prefetched: the sign-in route answers with a redirect to the
 * EmpirioLabs AI consent screen.
 */
export function SignInLink({ href, className, onClick, markSize = 16 }: SignInLinkProps) {
  return (
    <a className={className} href={href} rel="nofollow" onClick={onClick}>
      <Image src={mark} alt="" width={markSize} height={markSize} loading="eager" unoptimized />
      <span>Sign In</span>
    </a>
  );
}
