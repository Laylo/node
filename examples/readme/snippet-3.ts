import Laylo from "@laylo.com/node";

const laylo = new Laylo({
  clientId: process.env.LAYLO_CLIENT_ID,
  clientSecret: process.env.LAYLO_CLIENT_SECRET,
});

const handleRequest = async (customerApiKey: string) => {
  const customer = laylo.forCustomer(customerApiKey);
  return customer.drops.list();
};

await handleRequest("customer-api-key");
