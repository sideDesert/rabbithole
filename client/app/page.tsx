import { PromptInput } from "@/components/prompt-input";

export default function Page() {
  return (
    <div className="px-10 h-full grid grid-rows-[1fr_auto]">
      <div></div>
      <PromptInput className="mb-6" />
    </div>
  );
}
