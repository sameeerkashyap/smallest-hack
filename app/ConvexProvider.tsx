"use client";

import { ConvexProvider, ConvexReactClient } from "convex/react";
import { ReactNode, useEffect } from "react";

const convexUrl = process.env.NEXT_PUBLIC_CONVEX_URL!;
console.log("[ConvexProvider] Initializing with URL:", convexUrl);

const convex = new ConvexReactClient(convexUrl);

export default function ConvexClientProvider({
  children,
}: {
  children: ReactNode;
}) {
  useEffect(() => {
    console.log("[ConvexProvider] Provider mounted");
    console.log("[ConvexProvider] Convex URL:", convexUrl);
    return () => {
      console.log("[ConvexProvider] Provider unmounted");
    };
  }, []);

  return <ConvexProvider client={convex}>{children}</ConvexProvider>;
}
