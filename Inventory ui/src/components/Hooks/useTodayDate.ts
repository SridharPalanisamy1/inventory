import { useEffect, useState } from "react";

export const useTodayDate = () => {
  const [todayDate, setTodayDate] = useState<string>("");

  useEffect(() => {
    const fetchApiDate = async () => {
      try {
        const res = await fetch(process.env.NEXT_PUBLIC_LIVEDATE_URL || "");

        if (!res.ok) {
          throw new Error("Failed to fetch date");
        }

        const data = await res.json();


        if (!data?.current_date) {
          throw new Error("Invalid API response");
        }

        const date = new Date(data.current_date);

        if (isNaN(date.getTime())) {
          throw new Error("Invalid date from API");
        }

        const yyyy = date.getFullYear();
        const mm = String(date.getMonth() + 1).padStart(2, "0");
        const dd = String(date.getDate()).padStart(2, "0");

        setTodayDate(`${yyyy}-${mm}-${dd}`);
      } catch (error) {
        console.warn("Using fallback date:", error);
        setTodayDate(getTodayDate());
      }
    };

    fetchApiDate();
  }, []);

  return todayDate;
};


// Helper function to get today's date
export const getTodayDate = (): string => {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, '0');
  const day = String(today.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};



export const formatDateDDMMYYYY = (dateStr: string) => {
  const [year, month, day] = dateStr.split("-");
  return `${day}-${month}-${year}`;
};





export const convertImageToBase64 = (imageUrl: string): Promise<string> => {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      canvas.getContext("2d")?.drawImage(img, 0, 0);
      resolve(canvas.toDataURL("image/png"));
    };
    img.onerror = reject;
    img.src = imageUrl;
  });
};
