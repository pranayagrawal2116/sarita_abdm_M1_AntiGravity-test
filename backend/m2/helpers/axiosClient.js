const axios = require("axios");

const axiosClient = axios.create();

axiosClient.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error.config;
    if (error.response && error.response.status === 401 && !originalRequest._retry) {
      originalRequest._retry = true;
      console.log("[ABDM axiosClient] 401 Unauthorized encountered. Forcing token refresh and retrying...");
      
      const M2TokenManager = require("../tokens/M2TokenManager");
      
      M2TokenManager.invalidate();
      const newToken = await M2TokenManager.getGatewayToken();
      
      originalRequest.headers.Authorization = `Bearer ${newToken}`;
      
      return axiosClient(originalRequest);
    }
    return Promise.reject(error);
  }
);

module.exports = axiosClient;
