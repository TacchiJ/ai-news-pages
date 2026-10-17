-- Database concurrency and immutability invariants; no runtime content.
CREATE TRIGGER immutable_edition_update BEFORE UPDATE ON editions BEGIN SELECT RAISE(ABORT,'published edition is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_edition_delete BEFORE DELETE ON editions BEGIN SELECT RAISE(ABORT,'published edition is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER marked_revisit BEFORE INSERT ON topic_history
WHEN EXISTS (SELECT 1 FROM topic_history WHERE story_key=NEW.story_key)
AND NOT EXISTS (SELECT 1 FROM editions e,json_each(e.content,'$.topics') t WHERE e.id=NEW.edition_id AND json_extract(t.value,'$.storyKey')=NEW.story_key AND json_extract(t.value,'$.revisited')=1)
BEGIN SELECT RAISE(ABORT,'revisited topic must be marked'); END;
--> statement-breakpoint
CREATE TRIGGER valid_attempt BEFORE INSERT ON attempts
WHEN NEW.kind NOT IN ('ranked','practice') OR NEW.completed_at IS NOT NULL OR
(NEW.kind='practice' AND NOT EXISTS (SELECT 1 FROM attempts WHERE user_id=NEW.user_id AND edition_id=NEW.edition_id AND kind='ranked' AND completed_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invalid attempt'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_attempt BEFORE UPDATE ON attempts
WHEN NEW.id != OLD.id OR NEW.user_id != OLD.user_id OR NEW.edition_id != OLD.edition_id OR NEW.kind != OLD.kind OR NEW.request_key != OLD.request_key OR NEW.startedAt != OLD.startedAt OR OLD.completed_at IS NOT NULL OR (SELECT COUNT(*) FROM submissions WHERE attempt_id=OLD.id) != 5 OR NEW.completed_at IS NULL
BEGIN SELECT RAISE(ABORT,'attempt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_attempt_delete BEFORE DELETE ON attempts BEGIN SELECT RAISE(ABORT,'attempt is immutable'); END;
--> statement-breakpoint
CREATE TRIGGER valid_submission BEFORE INSERT ON submissions
WHEN NOT EXISTS (SELECT 1 FROM submissions WHERE attempt_id=NEW.attempt_id AND topic=NEW.topic)
AND (NEW.topic NOT BETWEEN 0 AND 4 OR NEW.a0 NOT BETWEEN 0 AND 3 OR NEW.a1 NOT BETWEEN 0 AND 3 OR
NEW.topic != (SELECT COUNT(*) FROM submissions WHERE attempt_id=NEW.attempt_id) OR
EXISTS (SELECT 1 FROM attempts WHERE id=NEW.attempt_id AND completed_at IS NOT NULL))
BEGIN SELECT RAISE(ABORT,'invalid or out of order submission'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_submission_update BEFORE UPDATE ON submissions BEGIN SELECT RAISE(ABORT,'answers are locked'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_submission_delete BEFORE DELETE ON submissions BEGIN SELECT RAISE(ABORT,'answers are locked'); END;
--> statement-breakpoint
CREATE TRIGGER complete_attempt AFTER INSERT ON submissions
WHEN (SELECT COUNT(*) FROM submissions WHERE attempt_id=NEW.attempt_id)=5
BEGIN UPDATE attempts SET completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=NEW.attempt_id AND completed_at IS NULL; END;
--> statement-breakpoint
CREATE TRIGGER immutable_correction_update BEFORE UPDATE ON corrections BEGIN SELECT RAISE(ABORT,'corrections are append only'); END;
--> statement-breakpoint
CREATE TRIGGER immutable_correction_delete BEFORE DELETE ON corrections BEGIN SELECT RAISE(ABORT,'corrections are append only'); END;
--> statement-breakpoint
CREATE VIEW attempt_scores AS
SELECT a.*,COALESCE((SELECT SUM(
  (s.a0 = COALESCE((SELECT c.correct FROM corrections c WHERE c.edition_id=a.edition_id AND c.topic=s.topic AND c.question=0 ORDER BY c.id DESC LIMIT 1),json_extract(e.content,'$.topics['||s.topic||'].questions[0].correct'))) +
  (s.a1 = COALESCE((SELECT c.correct FROM corrections c WHERE c.edition_id=a.edition_id AND c.topic=s.topic AND c.question=1 ORDER BY c.id DESC LIMIT 1),json_extract(e.content,'$.topics['||s.topic||'].questions[1].correct')))
) FROM submissions s WHERE s.attempt_id=a.id),0) AS score
FROM attempts a JOIN editions e ON e.id=a.edition_id;
