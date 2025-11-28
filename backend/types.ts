export interface User {
    id: string;
    username: string;
    password: string; 
    role: 'admin' | 'user';
    balance: number;
  }
  
  export interface Car {
    id: string;
    model: string;
    price: number;
    ownerId: string;
  }

  