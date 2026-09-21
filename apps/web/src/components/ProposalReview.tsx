import { useState } from "react";

import type { ProposalView } from "../api.js";
import { translate, type UiLocale } from "../i18n.js";

export function ProposalReview(props: {
  proposal: ProposalView;
  locale?: UiLocale;
  onDecision: (decision: "approve" | "reject", reviewer: string) => void;
}) {
  const locale = props.locale ?? "en";
  const actionable = props.proposal.status === "proposed";
  const [reviewer, setReviewer] = useState("");
  const canDecide = actionable && reviewer.trim().length > 0;
  return (
    <section className="proposal-review" aria-labelledby="proposal-review-heading">
      <h2 id="proposal-review-heading">{translate(locale, "proposalReview")}</h2>
      <p>
        {translate(locale, "proposal")} {props.proposal.id}
      </p>
      <p>
        {translate(locale, "status")}: {props.proposal.status}
      </p>
      <p>
        {props.proposal.operations.length} {translate(locale, "operations")}
      </p>
      <label>
        {translate(locale, "reviewer")}
        <input
          aria-label={translate(locale, "reviewer")}
          disabled={!actionable}
          value={reviewer}
          onChange={(event) => setReviewer(event.target.value)}
        />
      </label>
      <div className="actions">
        <button
          type="button"
          disabled={!canDecide}
          onClick={() => props.onDecision("approve", reviewer.trim())}
        >
          {translate(locale, "approve")}
        </button>
        <button
          type="button"
          disabled={!canDecide}
          onClick={() => props.onDecision("reject", reviewer.trim())}
        >
          {translate(locale, "reject")}
        </button>
      </div>
    </section>
  );
}
