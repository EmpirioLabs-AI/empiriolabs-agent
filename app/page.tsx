import { Suspense } from "react";
import { ChatLoader } from "@/components/chat-loader";
import { ChatSkeleton } from "@/components/chat-skeleton";

export default function Page({ searchParams }: PageProps<"/">) {
  return (
    <Suspense fallback={<ChatSkeleton />}>
      <ChatLoader searchParams={searchParams} />
    </Suspense>
  );
}
