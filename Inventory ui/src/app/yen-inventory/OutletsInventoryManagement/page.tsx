"use client";

import React from "react";
import Link from "next/link";
import { Box } from "@mui/material";
import { usePathname } from "next/navigation";
import YenInventoryPage from "../page";

const PRIMARY_BLUE = "#1976d2";
const PRIMARY_BLUE_DARK = "#0f5fb5";
const PRIMARY_BLUE_SOFT = "#eef6ff";
const TAB_BORDER = "#bfdbfe";

const subItems = [
  {
    label: "Physical Stock Modification",
    shortLabel: "Physical Stock",
    path: "/yen-inventory/OutletsInventoryManagement/OutletPhysicalStockModification",
  },
  {
    label: "Physical Stock Variance Modification",
    shortLabel: "Variance",
    path: "/yen-inventory/OutletsInventoryManagement/OutletPhysicalStockVarianceModification",
  },
  {
    label: "Approved Stock",
    shortLabel: "Approved Stock",
    path: "/yen-inventory/OutletsInventoryManagement/ApprovedStock",
  },
  {
    label: "Stock Transaction / Ledger",
    shortLabel: "Ledger",
    path: "/yen-inventory/OutletsInventoryManagement/ledger",
  },
];

const OutletsInventoryManagementPage = () => {
  const pathname = usePathname();

  return (
    <Box sx={{ width: "100%" }}>
      <YenInventoryPage />

      <Box
        sx={{
          mx: { xs: 1, sm: 1.5 },
          px: { xs: 0.75, sm: 1 },
          py: { xs: 0.65, sm: 0.7 },
          display: "flex",
          alignItems: "center",
          gap: { xs: 0.6, sm: 0.8 },
          flexWrap: "wrap",
          border: "1px solid #cfe2f8",
          borderTop: "1px solid #e8f2ff",
          borderRadius: "0 0 12px 12px",
          background:
            "linear-gradient(180deg, #ffffff 0%, #fbfdff 100%)",
          boxShadow: "0 3px 8px rgba(15, 23, 42, 0.03)",
        }}
      >
        <Box
          sx={{
            display: "inline-flex",
            alignItems: "center",
            gap: 0.55,
            height: 32,
            px: 0.5,
            color: "#334155",
            fontSize: { xs: "11px", sm: "12px" },
            fontWeight: 900,
            whiteSpace: "nowrap",
            flexShrink: 0,
          }}
        >
          <Box
            component="span"
            sx={{
              width: 6,
              height: 6,
              borderRadius: "999px",
              backgroundColor: PRIMARY_BLUE,
            }}
          />
          Outlets
        </Box>

        <Box
          sx={{
            width: "1px",
            height: 24,
            backgroundColor: "#dbeafe",
            display: { xs: "none", sm: "block" },
            flexShrink: 0,
          }}
        />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: { xs: 0.55, sm: 0.7 },
            flexWrap: "wrap",
            flex: "1 1 auto",
            minWidth: 0,
          }}
        >
          {subItems.map((item) => {
            const isActive = pathname?.startsWith(item.path);

            return (
              <Link
                key={item.path}
                href={item.path}
                prefetch={false}
                style={{ textDecoration: "none" }}
              >
                <Box
                  title={item.label}
                  sx={{
                    position: "relative",
                    minHeight: 32,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    px: { xs: 1.15, sm: 1.45 },
                    py: 0.55,
                    borderRadius: "10px",
                    border: isActive
                      ? `1px solid ${TAB_BORDER}`
                      : "1px solid #e2e8f0",
                    backgroundColor: isActive ? PRIMARY_BLUE_SOFT : "#ffffff",
                    color: isActive ? PRIMARY_BLUE_DARK : "#334155",
                    fontSize: { xs: "11.5px", sm: "12px" },
                    fontWeight: isActive ? 900 : 800,
                    lineHeight: 1.15,
                    whiteSpace: "nowrap",
                    boxShadow: isActive
                      ? "0 1px 4px rgba(25, 118, 210, 0.10)"
                      : "0 1px 2px rgba(15, 23, 42, 0.04)",
                    cursor: "pointer",
                    transition: "all 0.16s ease",
                    maxWidth: {
                      xs: "calc(100vw - 54px)",
                      sm: "none",
                    },
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    "&::after": isActive
                      ? {
                          content: '""',
                          position: "absolute",
                          left: 10,
                          right: 10,
                          bottom: 3,
                          height: 2,
                          borderRadius: "999px",
                          backgroundColor: PRIMARY_BLUE,
                        }
                      : {},
                    "&:hover": {
                      borderColor: TAB_BORDER,
                      backgroundColor: isActive ? PRIMARY_BLUE_SOFT : "#f8fbff",
                      color: PRIMARY_BLUE_DARK,
                      transform: "translateY(-1px)",
                    },
                  }}
                >
                  <Box sx={{ display: { xs: "none", lg: "inline" } }}>
                    {item.label}
                  </Box>
                  <Box sx={{ display: { xs: "inline", lg: "none" } }}>
                    {item.shortLabel}
                  </Box>
                </Box>
              </Link>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default OutletsInventoryManagementPage;