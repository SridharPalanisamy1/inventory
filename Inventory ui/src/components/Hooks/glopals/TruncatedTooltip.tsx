import React, { useRef, useState, useEffect } from "react";
import { Tooltip, Typography } from "@mui/material";

interface TruncatedTooltipProps {
  children: React.ReactNode;
  width?: number | string;
  variant?: "body2" | "caption" | "subtitle2";
}

const TruncatedTooltip: React.FC<TruncatedTooltipProps> = ({ children, width = "100%", variant = "body2" }) => {
  const spanRef = useRef<HTMLSpanElement>(null);
  const [isOverflowed, setIsOverflowed] = useState(false);

  useEffect(() => {
    const el = spanRef.current;
    if (el) {
      setIsOverflowed(el.scrollWidth > el.clientWidth);
    }
  }, [children]);

  return (
    <Tooltip title={isOverflowed ? String(children) : ""} arrow>
      <Typography
        variant={variant}
        ref={spanRef}
        sx={{
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          maxWidth: width,
        }}
      >
        {children}
      </Typography>
    </Tooltip>
  );
};

export default TruncatedTooltip;
