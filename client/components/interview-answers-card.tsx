"use client";

interface InterviewAnswersCardProps {
  content: string;
}

function parseAnswers(content: string): { question: string; answer: string }[] {
  const body = content.replace(/^\[Interview Answers\]\n?/, "");
  return body
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const match = line.match(/^\d+\.\s*(.+?)\s*→\s*(.+)$/);
      if (match) return { question: match[1], answer: match[2] };
      return { question: "", answer: line };
    })
    .filter((qa) => qa.question);
}

export function InterviewAnswersCard({ content }: InterviewAnswersCardProps) {
  const pairs = parseAnswers(content);

  if (!pairs.length) return null;

  return (
    <div className="border-2 border-border shadow-md rounded-lg bg-card px-4 py-3 max-w-[85%] space-y-3">
      {pairs.map((qa, i) => (
        <div key={i} className="border-2 border-border rounded-md p-2 space-y-0.5">
          <p className="text-sm text-muted-foreground">
            <span className="font-medium">Q:</span> {qa.question}
          </p>
          <p className="text-sm text-foreground">
            <span className="font-medium">A:</span>{" "}
            {qa.answer.replace(/^[A-E]\)\s*/, "")}
          </p>
        </div>
      ))}
    </div>
  );
}
