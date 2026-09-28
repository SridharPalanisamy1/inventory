"use client";

import React from "react";
import { Box, Typography } from "@mui/material";
import InventoryIcon from "@mui/icons-material/Inventory";

interface DotLoaderLikeProps {
  message?: string;
}

const InventoryLoader: React.FC<DotLoaderLikeProps> = ({ message }) => {
  return (
    <Box
      sx={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        py: 2,
        gap: 1.5,
      }}
    >
      <InventoryIcon
        sx={{
          color: "#1976d2",
          fontSize: 28,
          animation: "pulse 1.2s infinite ease-in-out",
        }}
      />

      <Typography variant="body2">
        {message || ""}
      </Typography>

      <style jsx>{`
        @keyframes pulse {
          0%, 100% { opacity: 0.6; transform: scale(1); }
          50% { opacity: 1; transform: scale(1.15); }
        }
      `}</style>
    </Box>
  );
};

export default InventoryLoader;