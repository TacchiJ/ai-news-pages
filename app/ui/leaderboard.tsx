import { Trophy } from "lucide-react";
import { label, dateLabel } from "../../lib/client";
import type { Track } from "../../lib/domain";
import type { Ranking } from "../../lib/client-contract";
export default function EditionLeaderboard({
  track,
  date,
  ranking,
}: {
  track: Track;
  date: string;
  ranking: Ranking | null;
}) {
  return (
    <section className="panel leaderboard">
      <div className="section-title">
        <div>
          <span className="eyebrow">
            {label(track)} · {date && dateLabel(date, true)}
          </span>
          <h2>Edition leaderboard</h2>
        </div>
        <Trophy size={25} />
      </div>
      <p className="muted">
        Current rankings · first attempts only · may change as more people
        finish.
      </p>
      {ranking?.rows.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th scope="col">Rank</th>
                <th scope="col">Learner</th>
                <th scope="col">Score</th>
                <th scope="col">Completed</th>
              </tr>
            </thead>
            <tbody>
              {ranking.rows.map((r) => (
                <tr key={r.id} className={r.mine ? "my-row" : ""}>
                  <td>
                    {r.rank === 1 ? "♔" : r.rank.toString().padStart(2, "0")}
                  </td>
                  <th scope="row">
                    {r.displayName}
                    {r.mine && <span className="you">You</span>}
                  </th>
                  <td>
                    {r.score}
                    <span className="muted"> / 10</span>
                  </td>
                  <td>{new Date(r.completedAt).toLocaleString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="empty-small">
          <Trophy />
          <h3>The first spot is open.</h3>
          <p>Complete your first attempt at this edition to join.</p>
        </div>
      )}
      <p className="table-note">
        Ties use the server-recorded completion date and time, then a stable
        attempt ID. Showing up to 100 participants.
      </p>
    </section>
  );
}
