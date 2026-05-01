import type { GetServerSideProps } from "next";
import { startOAuthRedirect } from "../../../authOAuth";

export const getServerSideProps: GetServerSideProps = async (ctx) => startOAuthRedirect(ctx);

export default function OAuthStart() {
  return null;
}
