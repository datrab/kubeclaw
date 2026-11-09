"""Run through Paperless manage.py shell; output only encrypted binding and counts."""
import base64
import datetime
import json
import os


def bind_familyclaw(public_pem):
    from cryptography import x509
    from cryptography.hazmat.primitives import hashes, serialization
    from cryptography.hazmat.primitives.asymmetric import padding, rsa
    from cryptography.hazmat.primitives.ciphers.aead import AESGCM
    from cryptography.x509.oid import NameOID
    from django.contrib.auth import get_user_model
    from django.contrib.auth.models import Permission
    from django.db import transaction
    from django.db.models import Max
    from documents.models import Document, Tag, Correspondent, DocumentType, StoragePath, CustomField
    from documents.models import Workflow, WorkflowTrigger, WorkflowAction
    from guardian.shortcuts import assign_perm
    from rest_framework.authtoken.models import Token

    recipient = serialization.load_pem_public_key(public_pem.encode())
    if not isinstance(recipient, rsa.RSAPublicKey) or recipient.key_size < 2048:
        raise ValueError('Unexpected transport public key')
    with transaction.atomic():
        user, created = get_user_model().objects.get_or_create(
            username='familyclaw-reader', defaults={'first_name': 'Familyclaw', 'is_active': True})
        if user.first_name != 'Familyclaw' or user.is_staff or user.is_superuser:
            raise ValueError('Existing account is not the isolated Familyclaw reader')
        if created:
            user.set_unusable_password()
            user.save(update_fields=['password'])
        models = [Document, Tag, Correspondent, DocumentType, StoragePath, CustomField]
        names = ['view_' + model._meta.model_name for model in models]
        permissions = Permission.objects.filter(content_type__app_label='documents', codename__in=names)
        if permissions.count() != len(names):
            raise ValueError('Paperless read permission inventory mismatch')
        if not created and (user.groups.exists() or user.user_permissions.exclude(pk__in=permissions).exists()):
            raise ValueError('Unexpected existing reader authority')
        user.user_permissions.set(permissions)
        for model in models:
            assign_perm('view_' + model._meta.model_name, user, model.objects.all())
        # Preserve every existing owner, permission, document and workflow.
        workflow, new_workflow = Workflow.objects.get_or_create(name='Familyclaw: read access for new documents',
            defaults={'enabled': True, 'order': (Workflow.objects.aggregate(value=Max('order'))['value'] or 0) + 1})
        if new_workflow:
            trigger = WorkflowTrigger.objects.create(type=2, matching_algorithm=0)
            action = WorkflowAction.objects.create(type=1, order=0)
            action.assign_view_users.add(user)
            workflow.triggers.add(trigger)
            workflow.actions.add(action)
        elif (not workflow.enabled or workflow.triggers.count() != 1 or workflow.actions.count() != 1
              or workflow.triggers.first().type != 2
              or set(workflow.actions.first().assign_view_users.values_list('pk', flat=True)) != {user.pk}):
            raise ValueError('Existing Familyclaw workflow differs')
        token, _ = Token.objects.get_or_create(user=user)

        key = rsa.generate_private_key(public_exponent=65537, key_size=3072)
        hostname = 'familyclaw-database.familyclaw'
        name = x509.Name([x509.NameAttribute(NameOID.COMMON_NAME, hostname)])
        now = datetime.datetime.now(datetime.timezone.utc)
        cert = (x509.CertificateBuilder().subject_name(name).issuer_name(name).public_key(key.public_key())
                .serial_number(x509.random_serial_number()).not_valid_before(now - datetime.timedelta(minutes=5))
                .not_valid_after(now + datetime.timedelta(days=397))
                .add_extension(x509.SubjectAlternativeName([x509.DNSName(hostname),
                    x509.DNSName(hostname + '.svc.cluster.local')]), critical=False)
                .add_extension(x509.BasicConstraints(ca=True, path_length=0), critical=True)
                .sign(key, hashes.SHA256()))
        cert_pem = cert.public_bytes(serialization.Encoding.PEM).decode()
        private_pem = key.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.TraditionalOpenSSL,
                                       serialization.NoEncryption()).decode()
        payload = json.dumps({'paperlessUrl': 'http://paperless-ngx.paperless.svc.cluster.local:8000',
            'token': token.key, 'tls': {'tls.crt': cert_pem, 'ca.crt': cert_pem, 'tls.key': private_pem}}).encode()
        transport_key, nonce = AESGCM.generate_key(bit_length=256), os.urandom(12)
        sealed = AESGCM(transport_key).encrypt(nonce, payload, None)
        encode = lambda data: base64.b64encode(data).decode()
        envelope = {'key': encode(recipient.encrypt(transport_key, padding.OAEP(
            mgf=padding.MGF1(algorithm=hashes.SHA256()), algorithm=hashes.SHA256(), label=None))),
            'nonce': encode(nonce), 'ciphertext': encode(sealed[:-16]), 'tag': encode(sealed[-16:])}
        count = Document.objects.count()
    print(json.dumps({'readerCreated': created, 'superuser': False, 'readOnly': True,
                      'documentsGranted': count, 'futureDocumentWorkflow': True}))
    print('FAMILYCLAW_ENVELOPE=' + json.dumps(envelope))
