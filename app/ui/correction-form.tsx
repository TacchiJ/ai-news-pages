"use client";
import { api } from "../../lib/client";

export default function CorrectionForm({
  run,
}: {
  run: (fn: () => Promise<void>) => Promise<void>;
}) {
  return (
    <form
      className="panel correction-form"
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        if (
          !window.confirm(
            "This audited correction will consistently regrade every affected attempt. Apply it?",
          )
        )
          return;
        void run(async () => {
          await api("/api/owner", {
            action: "correct",
            editionId: form.get("editionId"),
            topic: Number(form.get("topic")) - 1,
            question: Number(form.get("question")) - 1,
            correct: Number(form.get("correct")) - 1,
            sourceUrl: form.get("sourceUrl"),
            explanation: form.get("explanation"),
            reason: form.get("reason"),
          });
          window.alert(
            "Correction recorded. Scores now reflect the corrected answer.",
          );
        });
      }}
    >
      <h2>Record a grading correction</h2>
      <label>
        Edition ID
        <input name="editionId" placeholder="technical:2026-10-16" required />
      </label>
      <div className="correction-numbers">
        {[
          { name: "topic", label: "Topic (1–5)", max: 5 },
          { name: "question", label: "Question (1–2)", max: 2 },
          { name: "correct", label: "Correct choice (1–4)", max: 4 },
        ].map((f) => (
          <label key={f.name}>
            {f.label}
            <input name={f.name} type="number" min={1} max={f.max} required />
          </label>
        ))}
      </div>
      <label>
        Supporting HTTPS source
        <input type="url" name="sourceUrl" required pattern="https://.*" />
      </label>
      <label>
        Corrected explanation
        <textarea name="explanation" minLength={20} maxLength={2000} required />
      </label>
      <label>
        Audit reason
        <textarea name="reason" minLength={10} maxLength={2000} required />
      </label>
      <button className="button primary">Apply audited correction</button>
    </form>
  );
}
