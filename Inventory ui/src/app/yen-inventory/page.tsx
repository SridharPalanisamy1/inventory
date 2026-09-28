"use client";

import React from "react";
import { usePathname, useRouter } from "next/navigation";
import { Box, Button } from "@mui/material";

const PRIMARY_BLUE = "#1976d2";
const PRIMARY_BLUE_DARK = "#0f5fb5";
const PRIMARY_BLUE_LIGHT = "#e8f2ff";

const modules = [
  {
    label: "Outlets",
    fullLabel: "Outlets Inventory Management",
    path: "/yen-inventory/OutletsInventoryManagement",
    defaultPath:
      "/yen-inventory/OutletsInventoryManagement/OutletPhysicalStockModification",
  },
  {
    label: "Warehouse",
    fullLabel: "Warehouse Inventory Management",
    path: "/yen-inventory/WarehouseInventoryManagement",
    defaultPath: "/yen-inventory/WarehouseInventoryManagement/stockModification",
  },
];

const DEFAULT_INVENTORY_PAGE =
  "/yen-inventory/OutletsInventoryManagement/OutletPhysicalStockModification";

const defaultRedirects: Record<string, string> = {
  "/yen-inventory/OutletsInventoryManagement":
    "/yen-inventory/OutletsInventoryManagement/OutletPhysicalStockModification",

  "/yen-inventory/WarehouseInventoryManagement":
    "/yen-inventory/WarehouseInventoryManagement/stockModification",
};

const YenInventoryPage = () => {
  const pathname = usePathname();
  const router = useRouter();

  React.useEffect(() => {
    if (!pathname) return;

    if (pathname === "/yen-inventory") {
      router.replace(DEFAULT_INVENTORY_PAGE);
      return;
    }

    const defaultPage = defaultRedirects[pathname];

    if (defaultPage) {
      router.replace(defaultPage);
    }
  }, [pathname, router]);

  const activeModule =
    modules.find(
      (item) => pathname === item.path || pathname?.startsWith(`${item.path}/`)
    ) || modules[0];

  const handleModuleClick = React.useCallback(
    (moduleItem: (typeof modules)[number]) => {
      router.push(moduleItem.defaultPath);
    },
    [router]
  );

  return (
    <Box
      sx={{
        width: "100%",
        px: { xs: 1, sm: 1.5 },
        pt: 1,
      }}
    >
      <Box
        sx={{
          width: "100%",
          minHeight: 42,
          px: { xs: 1, sm: 1.25 },
          py: 0.65,
          display: "flex",
          alignItems: "center",
          justifyContent: "flex-start",
          gap: 1.25,
          flexWrap: "wrap",
          border: "1px solid #cfe2f8",
          borderBottom: "0",
          borderRadius: "12px 12px 0 0",
          background: "linear-gradient(180deg, #ffffff 0%, #f8fbff 100%)",
          boxShadow: "0 2px 8px rgba(15, 23, 42, 0.035)",
          position: "relative",
        }}
      >
        <Box
          sx={{
            width: 4,
            height: 25,
            borderRadius: "999px",
            backgroundColor: PRIMARY_BLUE,
            flexShrink: 0,
          }}
        />

        <Box sx={{ minWidth: 0, flexShrink: 0 }}>
          <Box
            sx={{
              fontSize: "13px",
              fontWeight: 900,
              color: "#0f172a",
              lineHeight: 1.1,
              whiteSpace: "nowrap",
            }}
          >
            Inventory Management
          </Box>

          <Box
            sx={{
              mt: 0.15,
              fontSize: "11px",
              fontWeight: 700,
              color: "#64748b",
              whiteSpace: "nowrap",
            }}
          >
            {activeModule.fullLabel}
          </Box>
        </Box>

        <Box
          sx={{
            width: "1px",
            height: 24,
            backgroundColor: "#dbeafe",
            mx: 0.25,
            display: { xs: "none", sm: "block" },
          }}
        />

        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            gap: 0.75,
            flexWrap: "wrap",
          }}
        >
          {modules.map((item) => {
            const isActive =
              pathname === item.path || pathname?.startsWith(`${item.path}/`);

            return (
              <Button
                key={item.path}
                variant={isActive ? "contained" : "outlined"}
                size="small"
                onClick={() => handleModuleClick(item)}
                sx={{
                  minHeight: 29,
                  px: 1.5,
                  py: 0.3,
                  borderRadius: "8px",
                  textTransform: "none",
                  fontSize: "12px",
                  fontWeight: 800,
                  color: isActive ? "#ffffff" : PRIMARY_BLUE,
                  borderColor: isActive ? PRIMARY_BLUE : "#b8d6fb",
                  backgroundColor: isActive ? PRIMARY_BLUE : "#ffffff",
                  boxShadow: "none",
                  "&:hover": {
                    backgroundColor: isActive
                      ? PRIMARY_BLUE_DARK
                      : PRIMARY_BLUE_LIGHT,
                    borderColor: PRIMARY_BLUE,
                    boxShadow: "none",
                  },
                }}
              >
                {item.label}
              </Button>
            );
          })}
        </Box>
      </Box>
    </Box>
  );
};

export default YenInventoryPage;