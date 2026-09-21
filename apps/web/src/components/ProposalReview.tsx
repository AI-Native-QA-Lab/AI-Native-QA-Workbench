import type { ProposalView } from "../api.js";
import { translate, type UiLocale } from "../i18n.js";

export function ProposalReview(props: {
  proposal: ProposalView;
  locale?: UiLocale;
  onDecision: (decision: "approve" | "reject") => void;
}) {
  const locale = props.locale ?? "en";
  return (
    <section className="proposal-review" aria-labelledby="proposal-review-heading">
      <h2 id="proposal-review-heading">{translate(locale, "proposalReview")}</h2>
      <p>
        {translate(locale, "proposal")} {props.proposal.id}
      </p>
      <p>
        {translate(locale, "status")}: {props.proposal.status}
      </p>
      <p>{props.proposal.operations.length} operations</p>
      <div className="actions">
        <button type="button" onClick={() => props.onDecision("approve")}>
          {translate(locale, "approve")}
        </button>
        <button type="button" onClick={() => props.onDecision("reject")}>
          {translate(locale, "reject")}
        </button>
      </div>
    </section>
  );
}
