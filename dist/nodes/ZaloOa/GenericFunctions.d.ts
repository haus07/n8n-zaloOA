import type { IDataObject, IExecuteFunctions, INode } from 'n8n-workflow';
export declare const ZALO_API_BASE = "https://openapi.zalo.me";
export declare const ZALO_ZBS_API_BASE = "https://business.openapi.zalo.me";
export declare const ZALO_TOKEN_URL = "https://oauth.zaloapp.com/v4/oa/access_token";
export declare const TOKEN_EXPIRED_ERROR_CODES: Set<string | number>;
export interface ZaloCredentials {
    credentialName: string;
    appId: string;
    secretKey: string;
    oaSecretKey?: string;
    accessToken: string;
    refreshToken: string;
    n8nInstanceUrl?: string;
    n8nApiKey?: string;
    credentialId?: string;
    allowedHttpRequestDomains?: 'all' | 'domains' | 'none';
    allowedDomains?: string;
}
export interface ZaloTokenResponse {
    access_token?: string;
    refresh_token?: string;
    error?: number | string;
    message?: string;
}
export interface ZaloApiResponse extends IDataObject {
    error?: number | string;
    message?: string;
    data?: IDataObject;
}
export declare function zaloRefreshAccessToken(ctx: IExecuteFunctions, credentials: ZaloCredentials): Promise<ZaloTokenResponse>;
export declare function persistTokensToCredential(ctx: IExecuteFunctions, credentials: ZaloCredentials, newAccessToken: string, newRefreshToken: string): Promise<boolean>;
export declare function zaloApiRequest(ctx: IExecuteFunctions, method: 'GET' | 'POST' | 'PUT' | 'DELETE', baseUrl: string, endpoint: string, payload: IDataObject, credentials: ZaloCredentials, node: INode): Promise<ZaloApiResponse>;
export declare function formatZaloTemplateData(data: IDataObject | string | Array<{
    key: string;
    value: string;
}>): IDataObject;
export declare function normalizePhoneNumber(phone: string): string;
export declare function isValidVietnamesePhone(phone: string): boolean;
