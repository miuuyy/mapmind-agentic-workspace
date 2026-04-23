import React from "react";

import type { AppCopy } from "../../lib/appCopy";
import { renderDisplayText } from "../../lib/appUiHelpers";
import type { QuizQuestionReview, Topic, TopicQuizSession } from "../../lib/types";

export function QuizDialog({
  session,
  modalRef,
  closeButtonRef,
  selectedTopic,
  closeModal,
  error,
  reviews,
  answers,
  setAnswers,
  loading,
  submitQuiz,
  copy,
}: {
  session: TopicQuizSession | null;
  modalRef: React.RefObject<HTMLDivElement | null>;
  closeButtonRef: React.RefObject<HTMLButtonElement | null>;
  selectedTopic: Topic | null;
  closeModal: () => void;
  error: string | null;
  reviews: QuizQuestionReview[] | null;
  answers: Record<string, number>;
  setAnswers: React.Dispatch<React.SetStateAction<Record<string, number>>>;
  loading: boolean;
  submitQuiz: () => Promise<void>;
  copy: AppCopy;
}): React.JSX.Element | null {
  if (!session) return null;

  return (
    <div className="quizOverlay">
      <div
        ref={modalRef}
        className="quizModal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="quiz-dialog-title"
        aria-describedby="quiz-dialog-description"
        tabIndex={-1}
      >
        <div className="quizModalHeader">
          <div>
            <div id="quiz-dialog-title" className="cardTitle">{copy.quiz.title}</div>
            <div id="quiz-dialog-description" className="mutedSmall">{selectedTopic?.title ?? copy.quiz.selectedTopic}</div>
          </div>
          <button
            ref={closeButtonRef}
            className="modalCloseButton"
            onClick={closeModal}
            type="button"
            aria-label={copy.quiz.closeQuiz}
          >
            ×
          </button>
        </div>
        <div className="quizModalBody stack">
          {error ? <div className="inlineNotice inlineNoticeError">{error}</div> : null}
          {reviews ? (
            <div className="stack">
              {reviews.map((review) => (
                <div key={review.question_id} className="quizQuestion">
                  <div className="quizPrompt">{renderDisplayText(review.prompt)}</div>
                  <div className={review.was_correct ? "inlineNotice inlineNoticeSuccess" : "inlineNotice inlineNoticeError"}>
                    {review.was_correct ? copy.quiz.correct : copy.quiz.incorrect} · {renderDisplayText(copy.quiz.correctAnswer(review.correct_choice))}
                  </div>
                  {!review.was_correct && review.selected_choice ? <div className="quizReviewLine quizReviewWrong">{renderDisplayText(copy.quiz.yourAnswer(review.selected_choice))}</div> : null}
                  {review.explanation ? <div className="quizReviewLine">{renderDisplayText(review.explanation)}</div> : null}
                </div>
              ))}
            </div>
          ) : (
            <div className="stack">
              {session.questions.map((question) => (
                <div key={question.id} className="quizQuestion">
                  <div className="quizPrompt">{renderDisplayText(question.prompt)}</div>
                  <div className="quizChoices">
                    {question.choices.map((choice: string, index: number) => (
                      <button
                        key={`${question.id}-${index}`}
                        className={answers[question.id] === index ? "quizChoice quizChoiceSelected" : "quizChoice"}
                        onClick={() => setAnswers((current) => ({ ...current, [question.id]: index }))}
                        type="button"
                      >
                        <span className="quizChoiceText">{renderDisplayText(choice)}</span>
                      </button>
                    ))}
                  </div>
                </div>
              ))}
              <div className="quizActions">
                <span className="badge badge-gray">{session.generator}</span>
                <button className="assistantSendButton quizSubmitButton" disabled={loading} onClick={() => void submitQuiz()} type="button">
                  {loading ? copy.quiz.submitting : copy.quiz.submit}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
