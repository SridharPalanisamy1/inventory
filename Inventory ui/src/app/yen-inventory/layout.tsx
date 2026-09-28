"use client";

import React from "react";
import AuthGuard from "@/components/AuthGuard";

type YenInventoryLayoutProps = {
  children: React.ReactNode;
};

const YenInventoryLayout: React.FC<YenInventoryLayoutProps> = ({ children }) => {
  return <AuthGuard>{children}</AuthGuard>;
};

export default YenInventoryLayout;