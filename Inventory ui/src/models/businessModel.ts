// Interfaces for Business and Photo management
  export interface ShippingAddress {
    shippingId?:string;
    randomId:string;
    address: string;  // Shipping address
    phoneNo: string;
    emailId: string;
    gstIn: string;
    createdDate?: Date | null;  // Address creation timestamp (date + time)
    lastUpdatedDate?: Date | null;  // Last updated timestamp
  }

  export interface Business {
    businessId: string;
    companyName: string;
    address1: string;
    address2: string;
    phoneNo: string;
    emailId: string;
    gstIn: string;
    createdDate: Date | null;
    lastupdatedDate: Date | null;
    status: string;
    randomId: string;
    imageUrl: string | null;  // Add imageUrl here to hold the URL of the fetched photo
    isFetched: boolean;  // Add the 'isFetched' property
  }

export interface Photo {
  filename: string;
  id: string;
  imageUrl: string;
}

export interface BusinessPhotoState {
  businesses: Business[];
  shippingaddress:ShippingAddress[];
  photos: Photo[];
  loading: boolean;
  error: string | null;
  snackbarOpen: boolean;
  snackbarMessage: string;
  searchQuery: string;
  editIndex: number | null;
  dialogOpen: 'none' | 'edit';
  businessData: Business;
  uploadStatus: 'idle' | 'loading' | 'succeeded' | 'failed';
  uploadError: string | null;
}

// Initial state for the combined slice
export const initialState: BusinessPhotoState = {
  businesses: [],
  shippingaddress:[],
  photos: [],
  loading: false,
  error: null,
  snackbarOpen: false,
  snackbarMessage: '',
  searchQuery: '',
  editIndex: null,
  dialogOpen: 'none',
  businessData: {
    businessId: '',
    companyName: '',
    address1: '',
    address2: '',
    phoneNo: '',
    emailId: '',
    gstIn: '',
    createdDate:null,
    lastupdatedDate: null,
    status: 'active',
    randomId: '',
    imageUrl: null, // Initialize imageUrl as null
    isFetched: false, // Set it to false initially
  },
  uploadStatus: 'idle',
  uploadError: null,
};

















