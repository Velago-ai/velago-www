export type Category = "food" | "flight" | "parcel" | "hotel";

export interface ChatSession {
  id: string;
  title: string;
  category: Category;
  date: string;
  status: "Completed" | "Pending" | "Cancelled";
  preview: string;
}

export interface BookingRecord {
  id: string;
  provider: string;
  service: string;
  category: Category;
  date: string;
  price: string;
  status: "Confirmed" | "Completed" | "Cancelled";
  reference: string;
  details: { label: string; value: string }[];
}

export const PLACEHOLDER_USER = {
  fullName: "Alex Johnson",
  email: "alex@example.com",
};

export const CHAT_SESSIONS: ChatSession[] = [
  {
    id: "s1",
    title: "Parcel to Berlin",
    category: "parcel",
    date: "Today",
    status: "Pending",
    preview: "Collecting receiver details…",
  },
  {
    id: "s2",
    title: "Deliveroo order",
    category: "food",
    date: "Yesterday",
    status: "Completed",
    preview: "Pad Thai x2, delivered 19:42",
  },
  {
    id: "s3",
    title: "Flight to Madrid",
    category: "flight",
    date: "12 Apr",
    status: "Completed",
    preview: "Iberia IB3171 · One way",
  },
];

export const BOOKINGS: BookingRecord[] = [
  {
    id: "b1",
    provider: "DHL",
    service: "Parcel Delivery",
    category: "parcel",
    date: "Today",
    price: "£8.50",
    status: "Confirmed",
    reference: "DHL-44210982",
    details: [
      { label: "From", value: "12 Baker Street, London" },
      { label: "To", value: "Müllerstraße 8, Berlin" },
      { label: "Pickup", value: "Today, 16:00 – 18:00" },
      { label: "Weight", value: "2.4 kg" },
    ],
  },
  {
    id: "b2",
    provider: "Deliveroo",
    service: "Food Delivery",
    category: "food",
    date: "Yesterday",
    price: "£24.99",
    status: "Completed",
    reference: "DEL-7781",
    details: [
      { label: "Restaurant", value: "Thai Square" },
      { label: "Items", value: "Pad Thai x2, Spring rolls" },
      { label: "Delivered", value: "Yesterday, 19:42" },
    ],
  },
  {
    id: "b3",
    provider: "Duffel",
    service: "Flight",
    category: "flight",
    date: "12 Apr",
    price: "£189.00",
    status: "Completed",
    reference: "DUF-IB3171",
    details: [
      { label: "Route", value: "LHR → MAD" },
      { label: "Carrier", value: "Iberia IB3171" },
      { label: "Date", value: "12 Apr · 09:25" },
      { label: "Passenger", value: "Alex Johnson" },
    ],
  },
];

export const SAVED_ADDRESSES = [
  { id: "home", label: "Home", value: "12 Baker Street, London, W1U 6TN" },
  { id: "work", label: "Work", value: "45 Innovation Drive, Manchester, M1 2AB" },
];
