import type { GetServerSideProps } from "next";
import { finishOAuthRedirect } from "../../../../authOAuth";

export const getServerSideProps: GetServerSideProps = async (ctx) => finishOAuthRedirect(ctx);

export default function OAuthCallback() {
  return null;
}
