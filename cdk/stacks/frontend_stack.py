"""
Frontend CDK stack: S3 + CloudFront + Route53 + Cognito web client.

Deploys the Vite SPA to S3 behind CloudFront on velago.ai / www.velago.ai.
Creates a dedicated Cognito app client (no secret) for the browser SPA.
"""

import aws_cdk as cdk
from aws_cdk import (
    Duration,
    RemovalPolicy,
    Stack,
    CfnOutput,
    aws_certificatemanager as acm,
    aws_cloudfront as cloudfront,
    aws_cloudfront_origins as origins,
    aws_cognito as cognito,
    aws_route53 as route53,
    aws_route53_targets as targets,
    aws_s3 as s3,
)
from constructs import Construct



HOSTED_ZONE_ID = "Z028350928JLT1JTPZHG6"
ZONE_NAME = "velago.ai"
COGNITO_USER_POOL_ID = "us-east-1_VNtklrqED"


class FrontendStack(Stack):
    def __init__(self, scope: Construct, id: str, **kwargs) -> None:
        super().__init__(scope, id, **kwargs)

        project = self.node.try_get_context("project") or "velago"
        env_name = self.node.try_get_context("env") or "staging"

        # ── DNS ───────────────────────────────────────────────────────────
        hosted_zone = route53.HostedZone.from_hosted_zone_attributes(
            self,
            "HostedZone",
            hosted_zone_id=HOSTED_ZONE_ID,
            zone_name=ZONE_NAME,
        )

        # ── ACM certificate ───────────────────────────────────────────────
        # Import the existing wildcard cert created by the backend dns_stack.
        # ARN is passed via CDK context (resolved in workflow from velago-staging-dns outputs).
        certificate_arn = self.node.try_get_context("certificate_arn")
        if not certificate_arn:
            raise ValueError("CDK context 'certificate_arn' is required (see velago-staging-dns stack output)")
        certificate = acm.Certificate.from_certificate_arn(
            self, "Certificate", certificate_arn
        )

        # ── S3 bucket ─────────────────────────────────────────────────────
        bucket = s3.Bucket(
            self,
            "Bucket",
            removal_policy=RemovalPolicy.DESTROY,
            auto_delete_objects=True,
            block_public_access=s3.BlockPublicAccess.BLOCK_ALL,
            encryption=s3.BucketEncryption.S3_MANAGED,
        )

        # ── CloudFront OAC ────────────────────────────────────────────────
        oac = cloudfront.S3OriginAccessControl(
            self,
            "OAC",
            description=f"{project} {env_name} frontend",
        )

        # ── CloudFront distribution ───────────────────────────────────────
        distribution = cloudfront.Distribution(
            self,
            "Distribution",
            domain_names=[ZONE_NAME, f"www.{ZONE_NAME}"],
            certificate=certificate,
            default_root_object="index.html",
            price_class=cloudfront.PriceClass.PRICE_CLASS_100,
            default_behavior=cloudfront.BehaviorOptions(
                origin=origins.S3BucketOrigin.with_origin_access_control(
                    bucket,
                    origin_access_control=oac,
                ),
                viewer_protocol_policy=cloudfront.ViewerProtocolPolicy.REDIRECT_TO_HTTPS,
                cache_policy=cloudfront.CachePolicy.CACHING_OPTIMIZED,
                compress=True,
            ),
            # SPA routing: return index.html for unknown paths
            error_responses=[
                cloudfront.ErrorResponse(
                    http_status=403,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
                cloudfront.ErrorResponse(
                    http_status=404,
                    response_http_status=200,
                    response_page_path="/index.html",
                    ttl=Duration.seconds(0),
                ),
            ],
        )

        # ── Route53 records ───────────────────────────────────────────────
        cf_target = route53.RecordTarget.from_alias(
            targets.CloudFrontTarget(distribution)
        )

        route53.ARecord(
            self, "ApexARecord",
            zone=hosted_zone,
            target=cf_target,
        )
        route53.ARecord(
            self, "WwwARecord",
            zone=hosted_zone,
            record_name="www",
            target=cf_target,
        )
        # IPv6
        route53.AaaaRecord(
            self, "ApexAaaaRecord",
            zone=hosted_zone,
            target=cf_target,
        )
        route53.AaaaRecord(
            self, "WwwAaaaRecord",
            zone=hosted_zone,
            record_name="www",
            target=cf_target,
        )

        # ── Cognito web client (SPA — no secret, PKCE / SRP) ─────────────
        user_pool = cognito.UserPool.from_user_pool_id(
            self, "UserPool", user_pool_id=COGNITO_USER_POOL_ID
        )

        web_client = user_pool.add_client(
            "WebClient",
            user_pool_client_name=f"{project}-{env_name}-web",
            generate_secret=False,
            auth_flows=cognito.AuthFlow(
                user_srp=True,
                user_password=True,
            ),
            o_auth=cognito.OAuthSettings(
                flows=cognito.OAuthFlows(authorization_code_grant=True),
                scopes=[
                    cognito.OAuthScope.OPENID,
                    cognito.OAuthScope.EMAIL,
                    cognito.OAuthScope.PROFILE,
                ],
                callback_urls=[
                    f"https://{ZONE_NAME}/callback",
                    f"https://www.{ZONE_NAME}/callback",
                    "http://localhost:5173/callback",
                ],
                logout_urls=[
                    f"https://{ZONE_NAME}",
                    f"https://www.{ZONE_NAME}",
                    "http://localhost:5173",
                ],
            ),
            supported_identity_providers=[
                cognito.UserPoolClientIdentityProvider.COGNITO
            ],
            access_token_validity=cdk.Duration.hours(1),
            id_token_validity=cdk.Duration.hours(1),
            refresh_token_validity=cdk.Duration.days(7),
            prevent_user_existence_errors=True,
        )

        # ── Outputs ───────────────────────────────────────────────────────
        CfnOutput(self, "BucketName", value=bucket.bucket_name)
        CfnOutput(self, "DistributionId", value=distribution.distribution_id)
        CfnOutput(self, "DistributionDomain", value=distribution.distribution_domain_name)
        CfnOutput(self, "CognitoUserPoolId", value=COGNITO_USER_POOL_ID)
        CfnOutput(self, "CognitoWebClientId", value=web_client.user_pool_client_id)
