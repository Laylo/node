import Laylo, {
  Laylo as Named,
  LayloAPIError,
  VERSION,
  type ClientOptions,
  type RequestOptions,
} from "@laylo.com/node";

const options: ClientOptions = {
  userId: process.env.LAYLO_USER_ID,
  accessKey: process.env.LAYLO_ACCESS_KEY,
  secretKey: process.env.LAYLO_SECRET_KEY,
  source: "laylo-node-examples",
};

const laylo: Laylo = new Laylo(options);

const scoped: Named = laylo.forCustomer("example-customer-api-key");
const perCall: RequestOptions = { apiKey: "another-customer-api-key" };

const describeKeys = async (): Promise<void> => {
  const verified: Awaited<ReturnType<Laylo["keys"]["verify"]>> =
    await scoped.keys.verify();
  console.log(`@laylo.com/node ${VERSION}: ${verified.apiKeyStatus}`);

  try {
    await laylo.keys.verify(perCall);
  } catch (error) {
    if (error instanceof LayloAPIError) {
      console.error(`${String(error.status)}: ${error.message}`);
      return;
    }
    throw error;
  }
};

void describeKeys();
