import { create } from "zustand";

// The one transient message shown to the user, from anywhere in the app.
export const useNotice = create<{ message: string }>(() => ({ message: "" }));
export const notify = (message: string) => useNotice.setState({ message });
